import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import Landing from '@/pages/Landing';
import StudentEntry from '@/pages/StudentEntry';
import ExamPage from '@/pages/ExamPage';
import SubmittedPage from '@/pages/SubmittedPage';
import TeacherDashboard from '@/pages/TeacherDashboard';
import MyScore from '@/pages/MyScore';
import CodePage from '@/pages/CodePage';
import CodePracticePage from '@/pages/CodePracticePage';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/student" element={<StudentEntry />} />
      <Route path="/exam" element={<ExamPage />} />
      <Route path="/submitted" element={<SubmittedPage />} />
      <Route path="/teacher" element={<TeacherDashboard />} />
      <Route path="/my-score" element={<MyScore />} />
      <Route path="/code" element={<CodePage />} />
      <Route path="/code-practice" element={<CodePracticePage />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App