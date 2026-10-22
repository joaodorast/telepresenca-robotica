import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const RobotPage = lazy(() => import('./robot/RobotPage'));
const OperatorApp = lazy(() => import('./operator/OperatorApp'));
const StageLab = import.meta.env.DEV ? lazy(() => import('./dev/StageLab')) : null;

function Loading() {
  return (
    <div className="stage-bg flex h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-gold-400" />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/robot" element={<RobotPage />} />
        <Route path="/operator" element={<OperatorApp />} />
        {StageLab && <Route path="/dev/stage" element={<StageLab />} />}
        <Route path="*" element={<Navigate to="/operator" replace />} />
      </Routes>
    </Suspense>
  );
}
