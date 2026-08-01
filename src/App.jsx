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
import MeetingsPage from "./features/meetings/pages/MeetingsPage";
import CreateMeetingPage from "./features/meetings/pages/CreateMeetingPage";
import MeetingRoomPage from "./features/meetings/pages/MeetingRoomPage";
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
  extractChatMessage,
  getStoredUserId,
  normalizeMessage,
  parseBootstrap,
} from "./utils/teamChatHelpers";
import {
  leaveTeamChatGlobalChannels,
  leaveTeamChatUser,
  subscribeTeamChatGlobalChannels,
  subscribeTeamChatUser,
} from "./utils/teamChatEcho";

const CHAT_UNREAD_POLL_MS = 5000;

function App() {
  const navigate = useNavigate();
  const chatSnapshotRef = useRef(new Map());
  const notifiedMessageIdsRef = useRef(new Set());
  const notifiedTaskIdsRef = useRef(new Set());

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
      const messageKey = String(message.id);
      if (notifiedMessageIdsRef.current.has(messageKey)) return;
      notifiedMessageIdsRef.current.add(messageKey);
      if (notifiedMessageIdsRef.current.size > 250) {
        notifiedMessageIdsRef.current = new Set(
          [...notifiedMessageIdsRef.current].slice(-150)
        );
      }

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
      const route = detail.channelId
        ? `/team-chat/${detail.channelId}`
        : "/team-chat";

      const notificationItem = {
        id: `chat-${messageKey}`,
        title: detail.channelName || "New message",
        body,
        route,
        createdAt: message.created_at || new Date().toISOString(),
      };
      window.__collabflowNotifications = [
        notificationItem,
        ...(window.__collabflowNotifications || []).filter(
          (item) => item.id !== notificationItem.id
        ),
      ].slice(0, 50);
      window.dispatchEvent(
        new CustomEvent("collabflow:notification-added", {
          detail: notificationItem,
        })
      );

      const activeChannel = window.location.pathname.match(/^\/team-chat\/(\d+)/)?.[1];
      if (!activeChannel || Number(activeChannel) !== Number(detail.channelId)) {
        const nextUnread = Math.max(
          0,
          (Number(window.__collabflowChatUnread) || 0) + 1
        );
        window.__collabflowChatUnread = nextUnread;
        window.dispatchEvent(
          new CustomEvent("collabflow:team-chat-unread", {
            detail: { total: nextUnread },
          })
        );
      }

      showAppNotification({
        title: `New message${detail.channelName ? ` · ${detail.channelName}` : ""}`,
        body,
        toastMessage: body,
        toastOptions: { duration: 6000 },
        route,
        actions: [{ id: "reply", text: "Reply" }],
      }).catch(() => {});
    };

    const onTaskAssigned = (event) => {
      const task = event?.detail?.task;
      if (!task?.id) return;
      const taskKey = String(task.id);
      if (notifiedTaskIdsRef.current.has(taskKey)) return;
      notifiedTaskIdsRef.current.add(taskKey);

      const notificationItem = {
        id: `task-${taskKey}`,
        title: "New Task Assigned",
        body: String(task.title || "A new task was assigned to you"),
        route: "/tasks",
        createdAt: task.created_at || new Date().toISOString(),
      };
      window.__collabflowNotifications = [
        notificationItem,
        ...(window.__collabflowNotifications || []).filter(
          (item) => item.id !== notificationItem.id
        ),
      ].slice(0, 50);
      window.dispatchEvent(
        new CustomEvent("collabflow:notification-added", {
          detail: notificationItem,
        })
      );

      showAppNotification({
        title: "New Task Assigned",
        body: notificationItem.body,
        toastMessage: `New task: ${notificationItem.body}`,
        toastOptions: { duration: 6000 },
        route: "/tasks",
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
    let generation = 0;

    const dispatchIncoming = (payload, fallbackChannelId = null) => {
      const userId = getStoredUserId();
      const raw =
        extractChatMessage(payload) ??
        extractChatMessage(payload?.message) ??
        extractChatMessage(payload?.data?.message) ??
        payload?.message ??
        payload?.data ??
        payload;
      const message = normalizeMessage(raw);
      if (!message?.id) return;
      if (Number(message.user_id ?? message.user?.id) === Number(userId)) return;

      const channelId =
        message.channel_id ??
        message.channel?.id ??
        payload?.channel_id ??
        payload?.channel?.id ??
        payload?.data?.channel_id ??
        fallbackChannelId;
      window.dispatchEvent(
        new CustomEvent("collabflow:team-chat-message", {
          detail: {
            message,
            channelId,
            channelName:
              payload?.channel_name ??
              payload?.channel?.name ??
              message.channel?.name,
          },
        })
      );
    };

    const startSubscriptions = async () => {
      const currentGeneration = ++generation;
      leaveTeamChatUser();
      leaveTeamChatGlobalChannels();

      const userId = getStoredUserId();
      if (userId == null || !getToken()) return;

      subscribeTeamChatUser(userId, {
        onMessage: dispatchIncoming,
        onTaskAssigned: (payload) => {
          const task = payload?.task ?? payload?.data?.task ?? payload?.data ?? payload;
          if (!task?.id) return;
          window.dispatchEvent(
            new CustomEvent("collabflow:task-assigned", {
              detail: { task },
            })
          );
        },
      });
      try {
        const response = await teamChatBootstrap();
        if (currentGeneration !== generation) return;
        const { channels } = parseBootstrap(response);
        subscribeTeamChatGlobalChannels(
          channels.map((channel) => channel.id).filter((id) => id != null),
          { onMessage: dispatchIncoming }
        );
      } catch {
        // User-channel events and unread polling remain as fallbacks.
      }
    };

    const onAuthenticated = () => void startSubscriptions();
    const onLoggedOut = () => {
      generation += 1;
      leaveTeamChatUser();
      leaveTeamChatGlobalChannels();
    };

    window.addEventListener("collabflow:session-authenticated", onAuthenticated);
    window.addEventListener("collabflow:session-logged-out", onLoggedOut);
    void startSubscriptions();

    return () => {
      generation += 1;
      window.removeEventListener(
        "collabflow:session-authenticated",
        onAuthenticated
      );
      window.removeEventListener("collabflow:session-logged-out", onLoggedOut);
      leaveTeamChatUser();
      leaveTeamChatGlobalChannels();
    };
  }, []);

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
            const chatName = channelLabel(channel, usersById);
            window.dispatchEvent(
              new CustomEvent("collabflow:team-chat-message", {
                detail: {
                  message: lastMessage,
                  channelId: channel.id,
                  channelName: chatName,
                },
              })
            );
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
      <Route path="/meetings" element={<ProtectedRoute><PermissionRoute anyOf={[]}><MeetingsPage /></PermissionRoute></ProtectedRoute>} />
      <Route path="/meetings/create" element={<ProtectedRoute><PermissionRoute anyOf={[]}><CreateMeetingPage /></PermissionRoute></ProtectedRoute>} />
      <Route path="/meetings/:uuid" element={<ProtectedRoute><PermissionRoute anyOf={[]}><MeetingRoomPage /></PermissionRoute></ProtectedRoute>} />
    </Routes>
    </>
  );
}

export default App;
