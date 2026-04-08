import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import React, { Suspense } from 'react';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import { useAuthStore } from '@/stores';
import { Layout } from '@/components';
import UpgradeModal from '@/components/UpgradeModal';
import LoadingSpinner from '@/components/LoadingSpinner';

const Login = React.lazy(() => import('@/pages/Login'));
const Signup = React.lazy(() => import('@/pages/Signup'));
const PasswordReset = React.lazy(() => import('@/pages/PasswordReset'));
const VerifyEmail = React.lazy(() => import('@/pages/VerifyEmail'));
const Dashboard = React.lazy(() => import('@/pages/Dashboard'));
const Files = React.lazy(() => import('@/pages/Files'));
const QuizNew = React.lazy(() => import('@/pages/QuizNew'));
const QuizHistory = React.lazy(() => import('@/pages/QuizHistory'));
const QuizTake = React.lazy(() => import('@/pages/QuizTake'));
const QuizResults = React.lazy(() => import('@/pages/QuizResults'));
const WrongNotes = React.lazy(() => import('@/pages/WrongNotes'));
const Retry = React.lazy(() => import('@/pages/Retry'));
const Search = React.lazy(() => import('@/pages/Search'));
const Admin = React.lazy(() => import('@/pages/Admin'));
const Settings = React.lazy(() => import('@/pages/Settings'));
const NotFound = React.lazy(() => import('@/pages/NotFound'));
const PricingPage = React.lazy(() => import('@/pages/PricingPage'));
const BillingPage = React.lazy(() => import('@/pages/BillingPage'));
const Terms = React.lazy(() => import('@/pages/Terms'));
const Privacy = React.lazy(() => import('@/pages/Privacy'));
const Refund = React.lazy(() => import('@/pages/Refund'));
const DiagramPage = React.lazy(() => import('@/pages/DiagramPage'));

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

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>;
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
                <LazyRoute>
                  <Login />
                </LazyRoute>
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <LazyRoute>
                  <Signup />
                </LazyRoute>
              </PublicRoute>
            }
          />
           <Route
             path="/password-reset"
             element={
               <PublicRoute>
                  <LazyRoute>
                    <PasswordReset />
                  </LazyRoute>
                </PublicRoute>
              }
            />
            <Route path="/verify-email" element={<LazyRoute><VerifyEmail /></LazyRoute>} />
             <Route
               path="/pricing"
               element={
                 <ProtectedRoute>
                   <Layout>
                     <LazyRoute>
                       <PricingPage />
                     </LazyRoute>
                   </Layout>
                 </ProtectedRoute>
               }
             />
            <Route path="/terms" element={<LazyRoute><Terms /></LazyRoute>} />
            <Route path="/privacy" element={<LazyRoute><Privacy /></LazyRoute>} />
            <Route path="/refund" element={<LazyRoute><Refund /></LazyRoute>} />

          {/* Protected Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout>
                <LazyRoute>
                  <Dashboard />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/files" element={
            <ProtectedRoute>
              <Layout>
                <LazyRoute>
                  <Files />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/quiz/new" element={
            <ProtectedRoute>
              <Layout>
                <LazyRoute>
                  <QuizNew />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/quiz/history" element={
            <ProtectedRoute>
              <Layout>
                <LazyRoute>
                  <QuizHistory />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/quiz/:sessionId" element={
            <ProtectedRoute>
              <Layout showSidebar={false}>
                <LazyRoute>
                  <QuizTake />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/quiz/:sessionId/results" element={
            <ProtectedRoute>
              <Layout showSidebar={false}>
                <LazyRoute>
                  <QuizResults />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/wrong-notes" element={
            <ProtectedRoute>
              <Layout>
                <LazyRoute>
                  <WrongNotes />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/retry" element={
            <ProtectedRoute>
              <Layout>
                <LazyRoute>
                  <Retry />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/diagram/:conceptKey" element={
            <ProtectedRoute>
              <Layout>
                <LazyRoute>
                  <DiagramPage />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/search" element={
            <ProtectedRoute>
              <Layout>
                <LazyRoute>
                  <Search />
                </LazyRoute>
              </Layout>
            </ProtectedRoute>
          } />
           <Route path="/settings" element={
              <ProtectedRoute>
                <Layout>
                  <LazyRoute>
                    <Settings />
                  </LazyRoute>
                </Layout>
              </ProtectedRoute>
            } />
           <Route path="/settings/billing" element={
              <ProtectedRoute>
                <Layout>
                  <LazyRoute>
                    <BillingPage />
                  </LazyRoute>
                </Layout>
              </ProtectedRoute>
            } />
           <Route path="/admin" element={
             <ProtectedRoute>
               <AdminRoute>
                 <Layout showSidebar={false}>
                   <LazyRoute>
                     <Admin />
                   </LazyRoute>
                 </Layout>
               </AdminRoute>
             </ProtectedRoute>
           } />
          <Route path="*" element={<LazyRoute><NotFound /></LazyRoute>} />
        </Routes>
          <UpgradeModal />
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
