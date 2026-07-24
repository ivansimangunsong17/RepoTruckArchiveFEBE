/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { initialSalesOrders } from '../data/salesOrders';
import { fallbackCustomers, fallbackUsers } from '../data/masterData';
import { fallbackDrivers, fallbackTruckUnits } from '../data/truckData';
import {
  requestContainerJobCancellation,
  reviewContainerJobCancellation,
  updateContainerJob,
} from '../services/archive/containerJobService';
import {
  cancelSalesOrder,
  fetchSalesOrders,
  requestSalesOrderCancellation,
  reviewSalesOrderCancellation,
  saveSalesOrder,
} from '../services/archive/salesOrderService';
import { USER_ROLES, hasPermission } from '../constants/roles';
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
  'kir-chassis': 'tms-master-kir-chassis-v1',
  depots: 'tms-master-depots-v1',
  terminals: 'tms-master-terminals-v1',
  destinations: 'tms-master-destinations-v1',
};
const fallbackMasters = {
  customers: fallbackCustomers,
  trucks: fallbackTruckUnits,
  drivers: fallbackDrivers,
  users: fallbackUsers,
  'kir-chassis': [],
  depots: [],
  terminals: [],
  destinations: [],
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
    'kir-chassis': [],
    depots: [],
    terminals: [],
    destinations: [],
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
    'kir-chassis': readLocalMaster('kir-chassis'),
    depots: readLocalMaster('depots'),
    terminals: readLocalMaster('terminals'),
    destinations: readLocalMaster('destinations'),
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
    cancelRequestStatus: container.cancelRequestStatus || 'none',
    cancelRequestNote: container.cancelRequestNote || '',
    cancelRequestedByName: container.cancelRequestedByName || '',
    cancelRequestedByRole: container.cancelRequestedByRole || '',
    cancelRequestedAt: container.cancelRequestedAt || null,
    cancelReviewedByName: container.cancelReviewedByName || '',
    cancelReviewedAt: container.cancelReviewedAt || null,
    cancelReviewNote: container.cancelReviewNote || '',
    cancelledAt: container.cancelledAt || null,
    cancelledByName: container.cancelledByName || '',
    cancelReason: container.cancelReason || container.cancelRequestNote || '',
    cancelSource: container.cancelSource || '',
    repoLocation: container.repoLocation || '',
    repoStoredAt: container.repoStoredAt || null,
    repoReason: container.repoReason || '',
    repoNotes: container.repoNotes || '',
    repoContainerCondition: container.repoContainerCondition || '',
    repoEirNumber: container.repoEirNumber || '',
    repoEirDocument: container.repoEirDocument || null,
    repoReleasedDriverId: container.repoReleasedDriverId || null,
    repoReleasedVehicleId: container.repoReleasedVehicleId || null,
    repoCreatedByName: container.repoCreatedByName || '',
    repoPickedUpAt: container.repoPickedUpAt || null,
    repoPickedUpByName: container.repoPickedUpByName || '',
    receivedAt: container.receivedAt || receivedAt,
    runningAt: container.runningAt || null,
    completedAt: container.completedAt || null,
    updatedBy: container.updatedBy || null,
    updatedAt: container.updatedAt || null,
  }));
}

function findLocalContainerLocation(ordersList, containerId) {
  for (const order of ordersList || []) {
    const index = Array.isArray(order?.containers) ? order.containers.findIndex((container) => container.id === containerId) : -1;
    if (index >= 0) return { order, index };
  }
  return null;
}

function deriveOrderStatus(containers) {
  const activeContainers = containers.filter((container) => container.status !== 'cancelled');
  const allCancelled = containers.length > 0 && activeContainers.length === 0;
  const allCompleted = activeContainers.length > 0 && activeContainers.every((container) => container.status === 'completed');
  const hasProgress = activeContainers.some((container) => ['running', 'repo_stored', 'completed'].includes(container.status));
  return allCancelled ? 'cancelled' : allCompleted ? 'completed' : hasProgress ? 'running' : 'waiting_operational';
}

function hasProcessedContainers(order) {
  return Array.isArray(order?.containers)
    && order.containers.some((container) => !['received', 'waiting_operational'].includes(container.status || 'received'));
}

function normalizeAssignedJobForm(form) {
  const hasAssignment = Boolean(form.plateNumber && form.driver);
  if (!hasAssignment || ['repo_stored', 'completed', 'cancelled'].includes(form.status)) return form;
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
  const archiveDisabled = apiDataMode && user?.role === USER_ROLES.FINANCE;
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

    if (archiveDisabled) {
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
          kirChassisResult,
          depotsResult,
          terminalsResult,
          destinationsResult,
          ordersResult,
        ] = await Promise.allSettled([
          masterDatabaseMode ? fetchMaster('customers') : Promise.resolve(readLocalMaster('customers')),
          masterDatabaseMode ? fetchMaster('trucks') : Promise.resolve(readLocalMaster('trucks')),
          masterDatabaseMode ? fetchMaster('drivers') : Promise.resolve(readLocalMaster('drivers')),
          masterDatabaseMode ? (canReadUsers ? fetchMaster('users') : Promise.resolve([])) : Promise.resolve(readLocalMaster('users')),
          masterDatabaseMode ? fetchMaster('kir-chassis') : Promise.resolve(readLocalMaster('kir-chassis')),
          masterDatabaseMode ? fetchMaster('depots') : Promise.resolve(readLocalMaster('depots')),
          masterDatabaseMode ? fetchMaster('terminals') : Promise.resolve(readLocalMaster('terminals')),
          masterDatabaseMode ? fetchMaster('destinations') : Promise.resolve(readLocalMaster('destinations')),
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
          'kir-chassis': readSettledValue(kirChassisResult, [], 'Data Chassis'),
          depots: readSettledValue(depotsResult, [], 'Depo'),
          terminals: readSettledValue(terminalsResult, [], 'Terminal'),
          destinations: readSettledValue(destinationsResult, [], 'Lokasi tujuan'),
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
  }, [apiDataMode, archiveDisabled, authLoading, canReadUsers, masterDatabaseMode, salesOrderDatabaseMode, user]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsertMaster = useCallback(async (resource, row, id) => {
    if (masterDatabaseMode) {
      const saved = await saveMaster(resource, row, id);
      setMasters((current) => {
        const currentRows = current[resource] || [];
        const exists = currentRows.some((item) => item.id === saved.id);
        const nextRows = exists
          ? currentRows.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...currentRows];
        return { ...current, [resource]: nextRows };
      });
      return saved;
    }

    const saved = { ...row, id: id || `${resource}-${Date.now()}` };
    setMasters((current) => {
      const currentRows = current[resource] || [];
      const exists = currentRows.some((item) => item.id === saved.id);
      const nextRows = id
        ? exists
          ? currentRows.map((item) => item.id === id ? saved : item)
          : [saved, ...currentRows]
        : [saved, ...currentRows];
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
        [resource]: (current[resource] || []).filter((item) => item.id !== id),
      }));
      return;
    }

    setMasters((current) => {
      const nextRows = (current[resource] || []).filter((item) => item.id !== id);
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
          salesName: form.salesName || '',
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

    const existing = orders.find((order) => order.id === id);
    if (hasProcessedContainers(existing)) {
      const error = new Error('Sales Order tidak bisa dihapus karena sudah ada container yang diproses Operational.');
      error.statusCode = 409;
      throw error;
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
  }, [orders, salesOrderDatabaseMode, user]);

  const requestOrderCancellation = useCallback(async (id, payload = {}) => {
    const requestedByName = user?.fullName || user?.name || 'Sales';
    const requestedByRole = user?.role || 'sales';

    if (salesOrderDatabaseMode) {
      const saved = await requestSalesOrderCancellation(id, {
        cancelRequestNote: payload.cancelRequestNote || '',
        cancelRequestedByName: requestedByName,
        cancelRequestedByRole: requestedByRole,
      });
      setOrders((current) => current.map((order) => (order.id === id ? { ...order, ...saved } : order)));
      return saved;
    }

    const now = new Date().toISOString();
    const existing = orders.find((order) => order.id === id);
    if (['completed', 'cancelled'].includes(existing?.status)) {
      const error = new Error('Sales Order yang sudah selesai atau dibatalkan tidak bisa diajukan batal.');
      error.statusCode = 409;
      throw error;
    }
    setOrders((current) => {
      const nextOrders = current.map((order) => (order.id === id ? {
        ...order,
        cancelRequestStatus: 'submitted',
        cancelRequestNote: payload.cancelRequestNote || '',
        cancelRequestedByName: requestedByName,
        cancelRequestedByRole: requestedByRole,
        cancelRequestedAt: now,
        cancelReviewedByName: '',
        cancelReviewedAt: null,
        cancelReviewNote: '',
        updatedBy: requestedByName,
        updatedAt: now,
      } : order));
      persistLocalOrders(nextOrders);
      return nextOrders;
    });

    return {
      id,
      cancelRequestStatus: 'submitted',
      cancelRequestNote: payload.cancelRequestNote || '',
      cancelRequestedByName: requestedByName,
      cancelRequestedByRole: requestedByRole,
      cancelRequestedAt: now,
      cancelReviewedByName: '',
      cancelReviewedAt: null,
      cancelReviewNote: '',
      updatedBy: requestedByName,
      updatedAt: now,
    };
  }, [orders, salesOrderDatabaseMode, user]);

  const reviewOrderCancellation = useCallback(async (id, payload = {}) => {
    const reviewedByName = user?.fullName || user?.name || 'Operational';
    if (salesOrderDatabaseMode) {
      const saved = await reviewSalesOrderCancellation(id, {
        approved: Boolean(payload.approved),
        cancelReviewNote: payload.cancelReviewNote || '',
        cancelReviewedByName: reviewedByName,
      });
      setOrders((current) => current.map((order) => (order.id === id ? { ...order, ...saved } : order)));
      return saved;
    }

    const now = new Date().toISOString();
    const existingOrder = orders.find((order) => order.id === id);
    if (payload.approved && hasProcessedContainers(existingOrder)) {
      const error = new Error('Sales Order tidak bisa dibatalkan karena sudah ada container yang diproses Operational.');
      error.statusCode = 409;
      throw error;
    }
    let nextSaved = null;
    setOrders((current) => {
      const existing = current.find((order) => order.id === id);

      const nextOrder = {
        ...(existing || {}),
        cancelRequestStatus: payload.approved ? 'approved' : 'rejected',
        cancelReviewedByName: reviewedByName,
        cancelReviewedAt: now,
        cancelReviewNote: payload.cancelReviewNote || '',
        updatedBy: reviewedByName,
        updatedAt: now,
      };
      if (payload.approved) {
        nextOrder.status = 'cancelled';
        nextOrder.cancelledAt = now;
      }

      const nextOrders = current.map((order) => (order.id === id ? nextOrder : order));
      persistLocalOrders(nextOrders);
      nextSaved = nextOrder;
      return nextOrders;
    });

    return nextSaved;
  }, [orders, salesOrderDatabaseMode, user]);

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
          cancelReason: normalizedForm.status === 'cancelled' ? normalizedForm.cancelReason || normalizedForm.cancelRequestNote || container.cancelReason || 'Pembatalan Container Job' : container.cancelReason,
          cancelSource: normalizedForm.status === 'cancelled' ? normalizedForm.cancelSource || container.cancelSource || 'operational' : container.cancelSource,
          cancelledByName: normalizedForm.status === 'cancelled' ? normalizedForm.cancelledByName || user?.fullName || user?.name || 'Operational' : container.cancelledByName,
          cancelledAt: normalizedForm.status === 'cancelled' ? normalizedForm.cancelledAt || container.cancelledAt || now : container.cancelledAt,
          cancelRequestStatus: normalizedForm.status === 'cancelled' ? 'approved' : container.cancelRequestStatus,
          repoStoredAt: normalizedForm.status === 'repo_stored' ? normalizedForm.repoStoredAt || container.repoStoredAt || now : container.repoStoredAt,
          repoCreatedByName: normalizedForm.status === 'repo_stored' ? normalizedForm.repoCreatedByName || container.repoCreatedByName || user?.fullName || user?.name || 'Operational' : container.repoCreatedByName,
          repoPickedUpAt: container.status === 'repo_stored' && normalizedForm.status !== 'repo_stored' ? normalizedForm.repoPickedUpAt || container.repoPickedUpAt || now : container.repoPickedUpAt,
          repoPickedUpByName: container.status === 'repo_stored' && normalizedForm.status !== 'repo_stored' ? normalizedForm.repoPickedUpByName || user?.fullName || user?.name || 'Operational' : container.repoPickedUpByName,
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

  const requestJobCancellation = useCallback(async (id, payload = {}) => {
    const requestedByName = user?.fullName || user?.name || 'Sales';
    const requestedByRole = user?.role || 'sales';

    if (salesOrderDatabaseMode) {
      const saved = await requestContainerJobCancellation(id, {
        cancelRequestNote: payload.cancelRequestNote || '',
        cancelRequestedByName: requestedByName,
        cancelRequestedByRole: requestedByRole,
      });
      setOrders((current) => current.map((order) => {
        if (!Array.isArray(order.containers)) return order;
        const containers = order.containers.map((container) => (container.id === saved.id ? saved : container));
        return {
          ...order,
          containers,
          status: deriveOrderStatus(containers),
          updatedBy: requestedByName,
          updatedAt: new Date().toISOString(),
        };
      }));
      return saved;
    }

    const now = new Date().toISOString();
    setOrders((current) => {
      const location = findLocalContainerLocation(current, id);
      if (!location) return current;
      const { order } = location;
      const container = order.containers[location.index];
      if (!container || container.status !== 'received') {
        const error = new Error('Container Job hanya bisa diajukan batal sebelum diproses Operational.');
        error.statusCode = 409;
        throw error;
      }
      const nextContainer = {
        ...container,
        cancelRequestStatus: 'submitted',
        cancelRequestNote: payload.cancelRequestNote || '',
        cancelRequestedByName: requestedByName,
        cancelRequestedByRole: requestedByRole,
        cancelRequestedAt: now,
        cancelReviewedByName: '',
        cancelReviewedAt: null,
        cancelReviewNote: '',
        updatedBy: requestedByName,
        updatedAt: now,
      };
      const nextOrders = current.map((item) => {
        if (item.id !== order.id) return item;
        const containers = item.containers.map((entry) => (entry.id === id ? nextContainer : entry));
        return {
          ...item,
          containers,
          status: deriveOrderStatus(containers),
          updatedBy: requestedByName,
          updatedAt: now,
        };
      });
      persistLocalOrders(nextOrders);
      return nextOrders;
    });

    return {
      id,
      cancelRequestStatus: 'submitted',
      cancelRequestNote: payload.cancelRequestNote || '',
      cancelRequestedByName: requestedByName,
      cancelRequestedByRole: requestedByRole,
      cancelRequestedAt: now,
      cancelReviewedByName: '',
      cancelReviewedAt: null,
      cancelReviewNote: '',
      updatedBy: requestedByName,
      updatedAt: now,
    };
  }, [salesOrderDatabaseMode, user]);

  const reviewJobCancellation = useCallback(async (id, payload = {}) => {
    const reviewedByName = user?.fullName || user?.name || 'Operational';

    if (salesOrderDatabaseMode) {
      const saved = await reviewContainerJobCancellation(id, {
        approved: Boolean(payload.approved),
        cancelRequestNote: payload.cancelRequestNote || '',
        cancelReviewNote: payload.cancelReviewNote || '',
        cancelSource: payload.cancelSource || 'sales',
        cancelReviewedByName: reviewedByName,
      });
      setOrders((current) => current.map((order) => {
        if (!Array.isArray(order.containers)) return order;
        const containers = order.containers.map((container) => (container.id === saved.id ? saved : container));
        return {
          ...order,
          containers,
          status: deriveOrderStatus(containers),
          updatedBy: reviewedByName,
          updatedAt: new Date().toISOString(),
        };
      }));
      return saved;
    }

    const now = new Date().toISOString();
    let nextSaved = null;
    setOrders((current) => {
      const location = findLocalContainerLocation(current, id);
      if (!location) return current;
      const { order } = location;
      const container = order.containers[location.index];
      if (!container || container.cancelRequestStatus !== 'submitted') {
        const error = new Error('Belum ada permintaan pembatalan yang menunggu approval.');
        error.statusCode = 409;
        throw error;
      }
      const nextContainer = {
        ...container,
        cancelRequestStatus: payload.approved ? 'approved' : 'rejected',
        cancelReviewedByName: reviewedByName,
        cancelReviewedAt: now,
        cancelReviewNote: payload.cancelReviewNote || '',
        updatedBy: reviewedByName,
        updatedAt: now,
      };
      if (payload.approved) {
        nextContainer.status = 'cancelled';
        nextContainer.cancelledAt = now;
        nextContainer.cancelReason = payload.cancelRequestNote || container.cancelRequestNote || container.cancelReason || 'Pembatalan Container Job';
        nextContainer.cancelSource = payload.cancelSource || container.cancelSource || 'sales';
        nextContainer.cancelledByName = reviewedByName;
      }
      const nextOrders = current.map((item) => {
        if (item.id !== order.id) return item;
        const containers = item.containers.map((entry) => (entry.id === id ? nextContainer : entry));
        return {
          ...item,
          containers,
          status: deriveOrderStatus(containers),
          updatedBy: reviewedByName,
          updatedAt: now,
        };
      });
      persistLocalOrders(nextOrders);
      nextSaved = nextContainer;
      return nextOrders;
    });

    return nextSaved;
  }, [salesOrderDatabaseMode, user]);

  const value = useMemo(() => ({
    isDatabaseMode: salesOrderDatabaseMode, isMasterDatabaseMode: masterDatabaseMode, masters, orders, loading, error, refresh,
    upsertMaster, removeMaster, upsertOrder, cancelOrder, requestOrderCancellation, reviewOrderCancellation, requestJobCancellation, reviewJobCancellation, updateJob,
  }), [cancelOrder, error, loading, masterDatabaseMode, masters, orders, refresh, removeMaster, requestJobCancellation, requestOrderCancellation, reviewJobCancellation, reviewOrderCancellation, salesOrderDatabaseMode, updateJob, upsertMaster, upsertOrder]);

  return <ArchiveDataContext.Provider value={value}>{children}</ArchiveDataContext.Provider>;
}

export function useArchiveData() {
  const context = useContext(ArchiveDataContext);
  if (!context) throw new Error('useArchiveData harus digunakan di dalam ArchiveDataProvider.');
  return context;
}
