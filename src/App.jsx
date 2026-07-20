import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import AttendanceDashboard from "./pages/AttendanceDashboard";
import Budgetsindex from "./pages/Budgetsindex";
import BudgetForm from "./pages/BudgetForm";
import Expensesindex from "./pages/Expensesindex";
import ExpenseCreate from "./pages/ExpenseCreate";
import ExpenseDetail from "./pages/ExpenseDetail";
import ExpenseCategories from "./pages/ExpenseCategories";
import ExpenseCategoriesCreate from "./pages/ExpenseCategoryCreate";

import RoughWorkNotepad from "./pages/RoughWorkNotepad";
import TaskManagement from "./pages/TaskManagement";
import TaskCreate from "./pages/TaskCreate";
import LeaveRequests from "./pages/LeaveRequests";
import TeamChat from "./pages/TeamChat";
import EirmonAi from "./pages/EirmonAi";
import Unauthorized from "./pages/Unauthorized";
import AppUpdateOverlay from "./components/AppUpdateOverlay";
import EirmonAiWidget from "./components/EirmonAi/EirmonAiWidget";

import { bootstrapElectron } from "../electron/electronBootstrap";
import { startPunchOutOnAppClose } from "./utils/punchOutOnAppClose";
import { Toaster } from "react-hot-toast";

import ProtectedRoute from "./components/ProtectedRoute";
import PermissionRoute from "./components/PermissionRoute";
import { P } from "./constants/permissions";
import { getToken } from "./utils/storage";
import { getToastLogoIcon } from "./utils/appBrand";

function App() {
  useEffect(() => {
    const token = getToken();
    if (token) {
      bootstrapElectron(token);
    }
    const stopCloseGuard = startPunchOutOnAppClose();
    return () => {
      if (typeof stopCloseGuard === "function") stopCloseGuard();
    };
  }, []);

  return (
    <>
      <AppUpdateOverlay />
      <EirmonAiWidget />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 5000,
          icon: getToastLogoIcon(),
          className: "erimon-toast",
        }}
      />
    <Routes>
      <Route
        path="/"
        element={
          getToken() ? <Navigate to="/home" /> : <Navigate to="/login" />
        }
      />

      <Route path="/login" element={<Login />} />

      <Route
        path="/unauthorized"
        element={
          <ProtectedRoute>
            <Unauthorized />
          </ProtectedRoute>
        }
      />

      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_DASHBOARD]}>
              <Home />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_TASKS]}>
              <TaskManagement />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tasks/create"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.CREATE_TASKS]}>
              <TaskCreate />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/leave-requests"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[]}>
              <LeaveRequests />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_ATTENDANCE]}>
              <AttendanceDashboard />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/budgets"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_BUDGETS, P.MANAGE_BUDGETS]}>
              <Budgetsindex />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/budgets/create"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.MANAGE_BUDGETS, P.CREATE_BUDGETS]}>
              <BudgetForm />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/budgets/:id/edit"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.MANAGE_BUDGETS, P.EDIT_BUDGETS]}>
              <BudgetForm />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/expense"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_EXPENSES]}>
              <Expensesindex />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/expense/create"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.CREATE_EXPENSES]}>
              <ExpenseCreate />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/expense/:id/edit"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.CREATE_EXPENSES, P.EDIT_EXPENSES]}>
              <ExpenseCreate />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/expense-categories"
        element={
          <ProtectedRoute>
            <PermissionRoute
              anyOf={[
                P.VIEW_EXPENSE_CATEGORIES,
                P.MANAGE_EXPENSE_CATEGORIES,
                P.CREATE_EXPENSE_CATEGORIES,
              ]}
            >
              <ExpenseCategories />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/expense-categories/create"
        element={
          <ProtectedRoute>
            <PermissionRoute
              anyOf={[P.CREATE_EXPENSE_CATEGORIES, P.MANAGE_EXPENSE_CATEGORIES]}
            >
              <ExpenseCategoriesCreate />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/expense/:id"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_EXPENSES]}>
              <ExpenseDetail />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/rough-work"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[]}>
              <RoughWorkNotepad />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/team-chat"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[]}>
              <TeamChat />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team-chat/:channelId"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[]}>
              <TeamChat />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/eirmon-ai"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[]}>
              <EirmonAi />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
    </Routes>
    </>
  );
}

export default App;
