import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { FeedbackProvider } from './contexts/FeedbackContext';
import { AppErrorBoundary } from './components/common/PageStates';
import { ArchiveDataProvider } from './contexts/ArchiveDataContext';
import { router } from './routes/AppRoutes';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <FeedbackProvider>
          <ArchiveDataProvider>
            <RouterProvider router={router} />
          </ArchiveDataProvider>
        </FeedbackProvider>
      </AuthProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
