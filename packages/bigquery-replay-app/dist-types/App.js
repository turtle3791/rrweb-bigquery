import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, Route, Routes } from 'react-router-dom';
import { ReplayPage } from './pages/ReplayPage';
import { SearchPage } from './pages/SearchPage';
export function App() {
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { className: "app-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "RRWeb BigQuery Replay" }), _jsx("h1", { children: "Session Explorer" })] }), _jsx(Link, { className: "header-link", to: "/", children: "Search sessions" })] }), _jsxs(Routes, { children: [_jsx(Route, { element: _jsx(SearchPage, {}), path: "/" }), _jsx(Route, { element: _jsx(ReplayPage, {}), path: "/sessions/:sessionId" })] })] }));
}
//# sourceMappingURL=App.js.map