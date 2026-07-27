import { useEffect, useRef } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
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
import { showAppNotification } from "./utils/appNotification";
import { teamChatBootstrap } from "./api/teamChat.api";
import {
  channelLabel,
  getStoredUserId,
  messagePreview,
  parseBootstrap,
} from "./utils/teamChatHelpers";

const CHAT_UNREAD_POLL_MS = 10000;

function App() {
  const navigate = useNavigate();
  const chatSnapshotRef = useRef(new Map());

  useEffect(() => {
    const token = getToken();
    if (token) {
      bootstrapElectron(token);
    }
    const stopCloseGuard = startPunchOutOnAppClose();

    const onTeamChatMessage = (event) => {
      const detail = event?.detail || {};
      const message = detail.message;
      if (!message?.id) return;

      const senderName =
        message?.user?.name ??
        message?.sender?.name ??
        message?.author_name ??
        message?.user_name ??
        "Someone";
      const preview = String(message?._displayBody || message?.body || "").trim();
      const body = preview
        ? `${senderName}: ${preview}`
        : `${senderName} sent a message`;

      showAppNotification({
        title: `New message${detail.channelName ? ` · ${detail.channelName}` : ""}`,
        body,
        toastMessage: body,
        toastOptions: { duration: 6000 },
        route: detail.channelId ? `/team-chat/${detail.channelId}` : "/team-chat",
        actions: [{ id: "reply", text: "Reply" }],
      }).catch(() => {});
    };

    const onTaskAssigned = (event) => {
      const task = event?.detail?.task;
      if (!task?.id) return;
      showAppNotification({
        title: "New Task Assigned",
        body: task.title,
        toastMessage: `New task: ${task.title}`,
        toastOptions: { duration: 6000 },
      }).catch(() => {});
    };

    window.addEventListener("collabflow:team-chat-message", onTeamChatMessage);
    window.addEventListener("collabflow:task-assigned", onTaskAssigned);
    const stopNotificationActions = window.api?.onAppNotificationAction?.(
      ({ route }) => {
        if (route) navigate(route);
      }
    );

    return () => {
      if (typeof stopCloseGuard === "function") stopCloseGuard();
      window.removeEventListener("collabflow:team-chat-message", onTeamChatMessage);
      window.removeEventListener("collabflow:task-assigned", onTaskAssigned);
      if (typeof stopNotificationActions === "function") stopNotificationActions();
    };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    const checkUnread = async () => {
      if (!getToken()) {
        chatSnapshotRef.current = new Map();
        window.__collabflowChatUnread = 0;
        return;
      }
      try {
        const response = await teamChatBootstrap();
        if (cancelled) return;
        const { channels, users } = parseBootstrap(response);
        const usersById = new Map(users.map((user) => [user.id, user]));
        const nextSnapshot = new Map();
        let totalUnread = 0;

        channels.forEach((channel) => {
          const unread = Number(channel.unread_count) || 0;
          totalUnread += unread;
          const lastMessage = channel.last_message;
          const lastMessageId = lastMessage?.id ?? null;
          const previous = chatSnapshotRef.current.get(String(channel.id));
          nextSnapshot.set(String(channel.id), { unread, lastMessageId });

          if (
            previous &&
            unread > previous.unread &&
            lastMessageId &&
            lastMessageId !== previous.lastMessageId &&
            Number(lastMessage?.user_id ?? lastMessage?.user?.id) !==
              Number(getStoredUserId())
          ) {
            const sender =
              lastMessage?.user?.name ??
              lastMessage?.sender?.name ??
              lastMessage?.author_name ??
              "Someone";
            const preview = messagePreview(lastMessage);
            const chatName = channelLabel(channel, usersById);
            void showAppNotification({
              title: `New message · ${chatName}`,
              body: preview ? `${sender}: ${preview}` : `${sender} sent a message`,
              toastMessage: preview ? `${sender}: ${preview}` : `${sender} sent a message`,
              route: `/team-chat/${channel.id}`,
              actions: [{ id: "reply", text: "Reply" }],
            });
          }
        });

        chatSnapshotRef.current = nextSnapshot;
        window.__collabflowChatUnread = totalUnread;
        window.dispatchEvent(
          new CustomEvent("collabflow:team-chat-unread", {
            detail: { total: totalUnread },
          })
        );
      } catch {
        // Keep the last known badge when the network is temporarily unavailable.
      }
    };

    void checkUnread();
    const timer = window.setInterval(checkUnread, CHAT_UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
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
          className: "eirmon-toast",
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
            <PermissionRoute anyOf={[P.VIEW_TEAM_CHAT, P.MANAGE_TEAM_CHAT]}>
              <TeamChat />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team-chat/:channelId"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_TEAM_CHAT, P.MANAGE_TEAM_CHAT]}>
              <TeamChat />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/eirmon-ai"
        element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.USE_EIRMON_AI, P.USE_AI_MARKETING_ASSISTANT]}>
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
