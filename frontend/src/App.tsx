import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { type ReactNode, Suspense } from 'react';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import GuestErrorBoundary from '@/components/GuestErrorBoundary';
import { useAuthStore } from '@/stores';
import { Layout } from '@/components';
import UpgradeModal from '@/components/UpgradeModal';
import lazyWithRetry from '@/utils/lazyWithRetry';

const Landing = lazyWithRetry(() => import('@/pages/Landing'));
const Login = lazyWithRetry(() => import('@/pages/Login'));
const Signup = lazyWithRetry(() => import('@/pages/Signup'));
const PasswordReset = lazyWithRetry(() => import('@/pages/PasswordReset'));
const VerifyEmail = lazyWithRetry(() => import('@/pages/VerifyEmail'));
const Dashboard = lazyWithRetry(() => import('@/pages/Dashboard'));
const Files = lazyWithRetry(() => import('@/pages/Files'));
const QuizNew = lazyWithRetry(() => import('@/pages/QuizNew'));
const QuizHistory = lazyWithRetry(() => import('@/pages/QuizHistory'));
const QuizTake = lazyWithRetry(() => import('@/pages/QuizTake'));
const QuizResults = lazyWithRetry(() => import('@/pages/QuizResults'));
const WrongNotes = lazyWithRetry(() => import('@/pages/WrongNotes'));
const Retry = lazyWithRetry(() => import('@/pages/Retry'));
const Search = lazyWithRetry(() => import('@/pages/Search'));
const Admin = lazyWithRetry(() => import('@/pages/Admin'));
const Settings = lazyWithRetry(() => import('@/pages/Settings'));
const NotFound = lazyWithRetry(() => import('@/pages/NotFound'));
const PricingPage = lazyWithRetry(() => import('@/pages/PricingPage'));
const BillingPage = lazyWithRetry(() => import('@/pages/BillingPage'));
const Terms = lazyWithRetry(() => import('@/pages/Terms'));
const Privacy = lazyWithRetry(() => import('@/pages/Privacy'));
const Refund = lazyWithRetry(() => import('@/pages/Refund'));
const DiagramPage = lazyWithRetry(() => import('@/pages/DiagramPage'));
const TryQuiz = lazyWithRetry(() => import('@/pages/TryQuiz'));
const TryQuizTake = lazyWithRetry(() => import('@/pages/TryQuizTake'));
const TryQuizResults = lazyWithRetry(() => import('@/pages/TryQuizResults'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function SmartHomeRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [searchParams] = useSearchParams();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  if (localStorage.getItem('rn-has-account') === 'true' && !searchParams.has('landing')) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  return isAdmin ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <SmartHomeRoute>
              <LazyRoute>
                <Landing />
              </LazyRoute>
            </SmartHomeRoute>
          } />

          <Route path="/try" element={<GuestErrorBoundary><LazyRoute><TryQuiz /></LazyRoute></GuestErrorBoundary>} />
          <Route path="/try/quiz/:sessionId" element={<GuestErrorBoundary><LazyRoute><TryQuizTake /></LazyRoute></GuestErrorBoundary>} />
          <Route path="/try/quiz/:sessionId/results" element={<GuestErrorBoundary><LazyRoute><TryQuizResults /></LazyRoute></GuestErrorBoundary>} />
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
              <LazyRoute>
                <Signup />
              </LazyRoute>
            }
          />
           <Route
             path="/password-reset"
             element={
               <LazyRoute>
                 <PasswordReset />
               </LazyRoute>
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
          <Route path="/dashboard" element={
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

