/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { initialSalesOrders } from '../data/salesOrders';
import { fallbackCustomers, fallbackUsers } from '../data/masterData';
import { fallbackDrivers, fallbackTruckUnits } from '../data/truckData';
import { updateContainerJob } from '../services/archive/containerJobService';
import { cancelSalesOrder, fetchSalesOrders, saveSalesOrder } from '../services/archive/salesOrderService';
import { hasPermission } from '../constants/roles';
import { isApiDataSource } from '../services/config/dataSource';
import { archiveMaster, fetchMaster, saveMaster } from '../services/master-data/masterDataService';
import { useAuth } from './AuthContext';

const ArchiveDataContext = createContext(null);
const LOCAL_ORDERS_KEY = 'tms-sales-orders-v3';
const LOCAL_MASTER_KEYS = {
  customers: 'tms-master-clients-v2',
  trucks: 'tms-master-trucks-v2',
  drivers: 'tms-master-drivers-v2',
  users: 'tms-master-users-v2',
};
const fallbackMasters = {
  customers: fallbackCustomers,
  trucks: fallbackTruckUnits,
  drivers: fallbackDrivers,
  users: fallbackUsers,
};

function readLocalOrders() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY));
    return Array.isArray(stored) && stored.length ? stored : initialSalesOrders;
  } catch {
    return initialSalesOrders;
  }
}

function emptyApiMasters() {
  return {
    customers: [],
    trucks: [],
    drivers: [],
    users: [],
  };
}

function persistLocalOrders(nextOrders) {
  try {
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(nextOrders));
  } catch {
    // Local storage can be unavailable in private mode; the in-memory state still works.
  }
}

function readLocalMaster(resource) {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_MASTER_KEYS[resource]));
    return Array.isArray(stored) && stored.length ? stored : fallbackMasters[resource];
  } catch {
    return fallbackMasters[resource];
  }
}

function readLocalMasters() {
  return {
    customers: readLocalMaster('customers'),
    trucks: readLocalMaster('trucks'),
    drivers: readLocalMaster('drivers'),
    users: readLocalMaster('users'),
  };
}

function persistLocalMaster(resource, nextRows) {
  try {
    localStorage.setItem(LOCAL_MASTER_KEYS[resource], JSON.stringify(nextRows));
  } catch {
    // Keep in-memory updates even when storage is unavailable.
  }
}

function normalizeLocalContainers(containers, receivedAt) {
  return containers.map((container, index) => ({
    ...container,
    id: container.id || `ctr-${Date.now()}-${index}`,
    status: container.status || 'received',
    rpujStatus: container.rpujStatus || 'pending',
    receivedAt: container.receivedAt || receivedAt,
    runningAt: container.runningAt || null,
    completedAt: container.completedAt || null,
    updatedBy: container.updatedBy || null,
    updatedAt: container.updatedAt || null,
  }));
}

function deriveOrderStatus(containers) {
  const activeContainers = containers.filter((container) => container.status !== 'cancelled');
  const allCancelled = containers.length > 0 && activeContainers.length === 0;
  const allCompleted = activeContainers.length > 0 && activeContainers.every((container) => container.status === 'completed');
  const hasProgress = activeContainers.some((container) => ['running', 'completed'].includes(container.status));
  return allCancelled ? 'cancelled' : allCompleted ? 'completed' : hasProgress ? 'running' : 'waiting_operational';
}

function normalizeAssignedJobForm(form) {
  const hasAssignment = Boolean(form.plateNumber && form.driver);
  if (!hasAssignment || form.status === 'completed') return form;
  return {
    ...form,
    status: 'running',
    runningAt: form.runningAt || new Date().toISOString(),
  };
}

export function ArchiveDataProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const masterDatabaseMode = isApiDataSource();
  const salesOrderDatabaseMode = isApiDataSource();
  const apiDataMode = masterDatabaseMode || salesOrderDatabaseMode;
  const canReadUsers = hasPermission(user, 'users.manage');
  const [masters, setMasters] = useState(() => readLocalMasters());
  const [orders, setOrders] = useState(() => readLocalOrders());
  const [loading, setLoading] = useState(masterDatabaseMode || salesOrderDatabaseMode);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    if (apiDataMode && authLoading) {
      setLoading(true);
      return;
    }

    if (apiDataMode && !user) {
      setMasters(emptyApiMasters());
      setOrders([]);
      setLoading(false);
      return;
    }

    if (apiDataMode) {
      setLoading(true);
      try {
        const [
          customersResult,
          trucksResult,
          driversResult,
          usersResult,
          ordersResult,
        ] = await Promise.allSettled([
          masterDatabaseMode ? fetchMaster('customers') : Promise.resolve(readLocalMaster('customers')),
          masterDatabaseMode ? fetchMaster('trucks') : Promise.resolve(readLocalMaster('trucks')),
          masterDatabaseMode ? fetchMaster('drivers') : Promise.resolve(readLocalMaster('drivers')),
          masterDatabaseMode ? (canReadUsers ? fetchMaster('users') : Promise.resolve([])) : Promise.resolve(readLocalMaster('users')),
          salesOrderDatabaseMode ? fetchSalesOrders() : Promise.resolve(readLocalOrders()),
        ]);

        const fallbackErrors = [];
        const readSettledValue = (result, fallback, label) => {
          if (result.status === 'fulfilled') return result.value;
          fallbackErrors.push(`${label}: ${result.reason?.message || 'gagal dimuat'}`);
          return fallback;
        };

        setMasters({
          customers: readSettledValue(customersResult, [], 'Customer'),
          trucks: readSettledValue(trucksResult, [], 'Truck'),
          drivers: readSettledValue(driversResult, [], 'Driver'),
          users: readSettledValue(usersResult, [], 'User'),
        });
        setOrders(readSettledValue(ordersResult, [], 'Sales order'));
        setError(fallbackErrors.length ? `Sebagian data archive gagal dimuat. ${fallbackErrors[0]}` : '');
      } catch (requestError) {
        setError(requestError.message || 'Data gagal dimuat dari API.');
        setMasters(emptyApiMasters());
        setOrders([]);
      } finally {
        setLoading(false);
      }
    } else {
      setMasters(readLocalMasters());
      setOrders(readLocalOrders());
      setLoading(false);
    }
  }, [apiDataMode, authLoading, canReadUsers, masterDatabaseMode, salesOrderDatabaseMode, user]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsertMaster = useCallback(async (resource, row, id) => {
    if (masterDatabaseMode) {
      const saved = await saveMaster(resource, row, id);
      setMasters((current) => {
        const exists = current[resource].some((item) => item.id === saved.id);
        const nextRows = exists
          ? current[resource].map((item) => item.id === saved.id ? saved : item)
          : [saved, ...current[resource]];
        return { ...current, [resource]: nextRows };
      });
      return saved;
    }

    const saved = { ...row, id: id || `${resource}-${Date.now()}` };
    setMasters((current) => {
      const exists = current[resource].some((item) => item.id === saved.id);
      const nextRows = id
        ? exists
          ? current[resource].map((item) => item.id === id ? saved : item)
          : [saved, ...current[resource]]
        : [saved, ...current[resource]];
      persistLocalMaster(resource, nextRows);
      return { ...current, [resource]: nextRows };
    });
    return saved;
  }, [masterDatabaseMode]);

  const removeMaster = useCallback(async (resource, id) => {
    if (masterDatabaseMode) {
      await archiveMaster(resource, id);
      setMasters((current) => ({
        ...current,
        [resource]: current[resource].filter((item) => item.id !== id),
      }));
      return;
    }

    setMasters((current) => {
      const nextRows = current[resource].filter((item) => item.id !== id);
      persistLocalMaster(resource, nextRows);
      return { ...current, [resource]: nextRows };
    });
  }, [masterDatabaseMode]);

  const upsertOrder = useCallback(async (form, existing) => {
    if (salesOrderDatabaseMode) {
      const saved = await saveSalesOrder(form, user, existing);
      setOrders((current) => {
        const exists = current.some((order) => order.id === saved.id);
        return exists
          ? current.map((order) => order.id === saved.id ? saved : order)
          : [saved, ...current];
      });
      return saved;
    }

    const receivedAt = form.receivedAt || new Date().toISOString();
    const now = new Date().toISOString();
    let savedOrder = null;
    setOrders((current) => {
      let nextOrders;
      if (existing?.id) {
        nextOrders = current.map((order) => {
          if (order.id !== existing.id) return order;
          savedOrder = {
            ...order,
            ...form,
            receivedAt,
            containers: normalizeLocalContainers(form.containers, receivedAt),
            updatedBy: user?.fullName || 'System',
            updatedAt: now,
          };
          return savedOrder;
        });
      } else {
        savedOrder = {
          ...form,
          id: `so-${Date.now()}`,
          receivedAt,
          status: 'waiting_operational',
          runningAt: null,
          completedAt: null,
          salesName: user?.fullName || 'Sales',
          createdBy: user?.fullName || 'Sales',
          createdAt: receivedAt,
          updatedBy: user?.fullName || 'Sales',
          updatedAt: receivedAt,
          containers: normalizeLocalContainers(form.containers, receivedAt),
        };
        nextOrders = [savedOrder, ...current];
      }
      persistLocalOrders(nextOrders);
      return nextOrders;
    });
    return savedOrder;
  }, [salesOrderDatabaseMode, user]);

  const cancelOrder = useCallback(async (id) => {
    if (salesOrderDatabaseMode) {
      await cancelSalesOrder(id);
      setOrders((current) => current.map((order) => order.id === id ? {
        ...order,
        status: 'cancelled',
        updatedBy: user?.fullName || 'System',
        updatedAt: new Date().toISOString(),
      } : order));
      return;
    }

    setOrders((current) => {
      const nextOrders = current.map((order) => order.id === id ? {
        ...order,
        status: 'cancelled',
        updatedBy: user?.fullName || 'System',
        updatedAt: new Date().toISOString(),
      } : order);
      persistLocalOrders(nextOrders);
      return nextOrders;
    });
  }, [salesOrderDatabaseMode, user]);

  const updateJob = useCallback(async (id, form) => {
    if (salesOrderDatabaseMode) {
      const saved = await updateContainerJob(id, {
        ...form,
        updatedBy: user?.fullName || user?.name || 'Operational',
      }, masters);
      setOrders((current) => current.map((order) => {
        if (order.id !== saved.orderId) return order;
        const containers = order.containers.map((container) => container.id === saved.id ? saved : container);
        return {
          ...order,
          containers,
          status: deriveOrderStatus(containers),
          updatedBy: user?.fullName || 'Operational',
          updatedAt: new Date().toISOString(),
        };
      }));
      return saved;
    }

    const now = new Date().toISOString();
    const normalizedForm = normalizeAssignedJobForm(form);
    setOrders((current) => {
      const nextOrders = current.map((order) => {
        const hasJob = order.containers.some((container) => container.id === id);
        if (!hasJob) return order;
        const containers = order.containers.map((container) => container.id === id ? {
          ...container,
          ...normalizedForm,
          updatedBy: user?.fullName || 'Operational',
          updatedAt: now,
        } : container);
        return {
          ...order,
          containers,
          status: deriveOrderStatus(containers),
          updatedBy: user?.fullName || 'Operational',
          updatedAt: now,
        };
      });
      persistLocalOrders(nextOrders);
      return nextOrders;
    });
  }, [masters, salesOrderDatabaseMode, user]);

  const value = useMemo(() => ({
    isDatabaseMode: salesOrderDatabaseMode, isMasterDatabaseMode: masterDatabaseMode, masters, orders, loading, error, refresh,
    upsertMaster, removeMaster, upsertOrder, cancelOrder, updateJob,
  }), [cancelOrder, error, loading, masterDatabaseMode, masters, orders, refresh, removeMaster, salesOrderDatabaseMode, updateJob, upsertMaster, upsertOrder]);

  return <ArchiveDataContext.Provider value={value}>{children}</ArchiveDataContext.Provider>;
}

export function useArchiveData() {
  const context = useContext(ArchiveDataContext);
  if (!context) throw new Error('useArchiveData harus digunakan di dalam ArchiveDataProvider.');
  return context;
}
