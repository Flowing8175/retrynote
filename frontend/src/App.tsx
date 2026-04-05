import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

          {import.meta.env.DEV && (
            <Route
              path="/preview/quiz/new"
              element={
                <Layout>
                  <QuizNew />
                </Layout>
              }
            />
          )}

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
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminRoute>
                <Layout showSidebar={false}>
                  <Admin />
                </Layout>
              </AdminRoute>
            </ProtectedRoute>
          } />
        </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
