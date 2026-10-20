import React from 'react';
import { createRoot } from 'react-dom/client';
import { installDiagnostics, reportClientError } from './services/diagnostics.cjs';
import App from './App.jsx';

installDiagnostics(window);
class AppBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { reportClientError('render_failed'); }
  render() {
    if (!this.state.failed) return this.props.children;
    const ar = document.documentElement.lang === 'ar';
    return <main className="max-w-xl mx-auto p-8" role="alert"><h1>{ar ? 'تعذر عرض التطبيق' : 'Unable to display the app'}</h1><p>{ar ? 'أعد تحميل الصفحة. لن يُرسل محتواك ضمن تقرير الخطأ.' : 'Reload the page. Your content is not included in error reports.'}</p><button type="button" onClick={() => window.location.reload()}>{ar ? 'إعادة التحميل' : 'Reload'}</button></main>;
  }
}
createRoot(document.getElementById('root')).render(<AppBoundary><App /></AppBoundary>);
