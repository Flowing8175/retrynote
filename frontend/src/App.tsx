import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import React, { Suspense } from 'react';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import { useAuthStore } from '@/stores';
import { Layout } from '@/components';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import PasswordReset from '@/pages/PasswordReset';
import Dashboard from '@/pages/Dashboard';
import Files from '@/pages/Files';
import QuizNew from '@/pages/QuizNew';
import QuizHistory from '@/pages/QuizHistory';
import QuizTake from '@/pages/QuizTake';
import QuizResults from '@/pages/QuizResults';
import WrongNotes from '@/pages/WrongNotes';
import Retry from '@/pages/Retry';
import Search from '@/pages/Search';
import Admin from '@/pages/Admin';
import Settings from '@/pages/Settings';
import NotFound from '@/pages/NotFound';
import UpgradeModal from '@/components/UpgradeModal';
import LoadingSpinner from '@/components/LoadingSpinner';

const PricingPage = React.lazy(() => import('@/pages/PricingPage'));
const BillingPage = React.lazy(() => import('@/pages/BillingPage'));
const Terms = React.lazy(() => import('@/pages/Terms'));
const Privacy = React.lazy(() => import('@/pages/Privacy'));
const Refund = React.lazy(() => import('@/pages/Refund'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return !isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            }
          />
           <Route
             path="/password-reset"
             element={
               <PublicRoute>
                 <PasswordReset />
               </PublicRoute>
             }
           />
            <Route
              path="/pricing"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Suspense fallback={<LoadingSpinner />}>
                      <PricingPage />
                    </Suspense>
                  </Layout>
                </ProtectedRoute>
              }
            />
           <Route path="/terms" element={<Suspense fallback={<LoadingSpinner />}><Terms /></Suspense>} />
           <Route path="/privacy" element={<Suspense fallback={<LoadingSpinner />}><Privacy /></Suspense>} />
           <Route path="/refund" element={<Suspense fallback={<LoadingSpinner />}><Refund /></Suspense>} />

          {/* Protected Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/files" element={
            <ProtectedRoute>
              <Layout>
                <Files />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/quiz/new" element={
            <ProtectedRoute>
              <Layout>
                <QuizNew />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/quiz/history" element={
            <ProtectedRoute>
              <Layout>
                <QuizHistory />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/quiz/:sessionId" element={
            <ProtectedRoute>
              <Layout showSidebar={false}>
                <QuizTake />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/quiz/:sessionId/results" element={
            <ProtectedRoute>
              <Layout showSidebar={false}>
                <QuizResults />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/wrong-notes" element={
            <ProtectedRoute>
              <Layout>
                <WrongNotes />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/retry" element={
            <ProtectedRoute>
              <Layout>
                <Retry />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/search" element={
            <ProtectedRoute>
              <Layout>
                <Search />
              </Layout>
            </ProtectedRoute>
          } />
           <Route path="/settings" element={
             <ProtectedRoute>
               <Layout>
                 <Settings />
               </Layout>
             </ProtectedRoute>
           } />
           <Route path="/settings/billing" element={
             <ProtectedRoute>
               <Layout>
                 <Suspense fallback={<LoadingSpinner />}>
                   <BillingPage />
                 </Suspense>
               </Layout>
             </ProtectedRoute>
           } />
           <Route path="/admin" element={
            <ProtectedRoute>
              <AdminRoute>
                <Layout showSidebar={false}>
                  <Admin />
                </Layout>
              </AdminRoute>
            </ProtectedRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
          <UpgradeModal />
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
