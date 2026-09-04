import { Component, useEffect, useRef, Suspense, lazy, type ReactNode } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import ProtectedRoute from '@/components/ProtectedRoute';
import PermissionRoute from '@/components/PermissionRoute';
import { LoadingScreen } from '@/components/glass/Glass';
import { P } from '@/constants/permissions';
import { getToken } from '@/utils/storage';
import { getToastLogoIcon } from '@/utils/appBrand';
import { showAppNotification } from '@/utils/appNotification';
import {
  isViewingTask,
  pushWorkspaceNotification,
  taskDesktopRoute,
} from '@/utils/workspaceNotifications';
import { teamChatBootstrap, markTeamChatMessageDelivered } from '@/api/teamChat.api';
import {
  channelLabel,
  extractChatMessage,
  getStoredUserId,
  normalizeMessage,
  parseBootstrap,
} from '@/utils/teamChatHelpers';
import {
  leaveTeamChatGlobalChannels,
  leaveTeamChatUser,
  subscribeTeamChatGlobalChannels,
  subscribeTeamChatUser,
} from '@/utils/teamChatEcho';
import { bootstrapElectron } from '@electron/electronBootstrap';
import { startPunchOutOnAppClose } from '@/utils/punchOutOnAppClose';
import AppUpdateOverlay from '@/components/AppUpdateOverlay';
import EirmonAiWidget from '@/components/EirmonAi/EirmonAiWidget';
import IncomingCallOverlay from '@/features/meetings/components/IncomingCallOverlay';

const Login = lazy(() => import('@/pages/Login'));
const Home = lazy(() => import('@/pages/Home'));
const AttendanceDashboard = lazy(() => import('@/pages/AttendanceDashboard'));
const Budgetsindex = lazy(() => import('@/pages/Budgetsindex'));
const BudgetForm = lazy(() => import('@/pages/BudgetForm'));
const Expensesindex = lazy(() => import('@/pages/Expensesindex'));
const ExpenseCreate = lazy(() => import('@/pages/ExpenseCreate'));
const ExpenseDetail = lazy(() => import('@/pages/ExpenseDetail'));
const ExpenseCategories = lazy(() => import('@/pages/ExpenseCategories'));
const ExpenseCategoryCreate = lazy(() => import('@/pages/ExpenseCategoryCreate'));
const RoughWorkNotepad = lazy(() => import('@/pages/RoughWorkNotepad'));
const TaskManagement = lazy(() => import('@/pages/TaskManagement'));
const TaskCreate = lazy(() => import('@/pages/TaskCreate'));
const LeaveRequests = lazy(() => import('@/pages/LeaveRequests'));
const Profile = lazy(() => import('@/pages/Profile'));
const TeamChat = lazy(() => import('@/pages/TeamChat'));
const EirmonAi = lazy(() => import('@/pages/EirmonAi'));
const MeetingsPage = lazy(() => import('@/features/meetings/pages/MeetingsPage'));
const CreateMeetingPage = lazy(() => import('@/features/meetings/pages/CreateMeetingPage'));
const MeetingRoomPage = lazy(() => import('@/features/meetings/pages/MeetingRoomPage'));
const Unauthorized = lazy(() => import('@/pages/Unauthorized'));

const CHAT_UNREAD_POLL_MS = 5000;

function LoadingFallback({ label }: { label?: string }) {
  if (!label) return null;
  return <LoadingScreen label={label} />;
}

class RouteErrorBoundary extends Component<
  { children: ReactNode; onRetry?: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--theme-bg,#050505)] p-6">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-lg font-semibold">This screen could not open.</p>
          <p className="text-sm text-glass-muted">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            className="glass-btn glass-btn-primary"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry?.();
              if (!this.props.onRetry) window.location.reload();
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}

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

    const onTeamChatMessage = (event: CustomEvent) => {
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
        'Someone';
      const preview = String(message?._displayBody || message?.body || '').trim();
      const body = preview
        ? `${senderName}: ${preview}`
        : `${senderName} sent a message`;
      const route = detail.channelId
        ? `/team-chat/${detail.channelId}`
        : '/team-chat';

      const notificationItem = {
        id: `chat-${messageKey}`,
        title: detail.channelName || 'New message',
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
        new CustomEvent('collabflow:notification-added', {
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
          new CustomEvent('collabflow:team-chat-unread', {
            detail: { total: nextUnread },
          })
        );
      }

      showAppNotification({
        title: `New message${detail.channelName ? ` · ${detail.channelName}` : ''}`,
        body,
        toastMessage: body,
        toastOptions: { duration: 6000 },
        route,
        actions: [{ id: 'reply', text: 'Reply' }],
      }).catch(() => {});
    };

    const onTaskAssigned = (event: CustomEvent) => {
      const task = event?.detail?.task;
      if (!task?.id) return;
      const taskKey = String(task.id);
      if (notifiedTaskIdsRef.current.has(taskKey)) return;
      notifiedTaskIdsRef.current.add(taskKey);

      const assigner =
        task.assigned_by?.name ||
        task.creator?.name ||
        task.assigned_by_name ||
        'Someone';
      const route = task.desktop_route || taskDesktopRoute(task.id);
      const body = `${assigner} assigned you: ${task.title || 'a task'}`;

      pushWorkspaceNotification({
        id: `task-${taskKey}`,
        title: 'New task assigned',
        body,
        route,
      });

      if (isViewingTask(task.id)) return;

      showAppNotification({
        title: 'New task assigned',
        body,
        toastMessage: body,
        toastOptions: { duration: 6000 },
        route,
        actions: [{ id: 'open', text: 'Open' }],
      }).catch(() => {});
    };

    const onTaskActivity = (event: CustomEvent) => {
      const detail = event?.detail as {
        type?: string;
        message?: string;
        desktop_route?: string;
        actor?: { name?: string };
        comment?: { id?: string | number };
        attachment?: { id?: string | number };
        task?: { id?: string | number; title?: string };
      };
      const task = detail?.task;
      if (!task?.id) return;
      const type = String(detail?.type || '');
      if (type === 'updated') return;

      const route = detail?.desktop_route || taskDesktopRoute(task.id);
      const title = type === 'attachment' ? 'Task attachment' : 'Task chat';
      const body =
        detail?.message ||
        `${detail?.actor?.name || 'Someone'} updated ${task.title || 'a task'}`;
      const key = `${type}-${task.id}-${detail?.comment?.id || detail?.attachment?.id || Date.now()}`;

      pushWorkspaceNotification({
        id: `task-activity-${key}`,
        title,
        body,
        route,
      });

      if (isViewingTask(task.id)) return;

      showAppNotification({
        title,
        body,
        toastMessage: body,
        toastOptions: { duration: 6000 },
        route,
        actions: [{ id: 'open', text: 'Open' }],
      }).catch(() => {});
    };

    window.addEventListener('collabflow:team-chat-message', onTeamChatMessage as EventListener);
    window.addEventListener('collabflow:task-assigned', onTaskAssigned as EventListener);
    window.addEventListener('collabflow:task-activity', onTaskActivity as EventListener);
    const stopNotificationActions = window.api?.onAppNotificationAction?.(
      ({ route }: { route?: string }) => {
        if (
          typeof route === 'string' &&
          route.startsWith('/') &&
          !route.startsWith('//') &&
          !/^[a-z][a-z0-9+.-]*:/i.test(route)
        ) {
          navigate(route);
        }
      }
    );

    return () => {
      if (typeof stopCloseGuard === 'function') stopCloseGuard();
      window.removeEventListener('collabflow:team-chat-message', onTeamChatMessage as EventListener);
      window.removeEventListener('collabflow:task-assigned', onTaskAssigned as EventListener);
      window.removeEventListener('collabflow:task-activity', onTaskActivity as EventListener);
      if (typeof stopNotificationActions === 'function') stopNotificationActions();
    };
  }, [navigate]);

  useEffect(() => {
    let generation = 0;

    const dispatchIncoming = (payload: unknown, fallbackChannelId: number | null = null) => {
      const userId = getStoredUserId();
      const raw =
        extractChatMessage(payload) ??
        extractChatMessage((payload as Record<string, unknown>)?.message) ??
        extractChatMessage((payload as Record<string, unknown>)?.data?.message) ??
        (payload as Record<string, unknown>)?.message ??
        (payload as Record<string, unknown>)?.data ??
        payload;
      const message = normalizeMessage(raw);
      if (!message?.id) return;
      if (Number(message.user_id ?? message.user?.id) === Number(userId)) return;

      const channelId =
        message.channel_id ??
        message.channel?.id ??
        (payload as Record<string, unknown>)?.channel_id ??
        (payload as Record<string, unknown>)?.channel?.id ??
        (payload as Record<string, unknown>)?.data?.channel_id ??
        fallbackChannelId;

      if (channelId != null && message.id != null) {
        markTeamChatMessageDelivered(channelId, message.id).catch(() => {});
      }

      window.dispatchEvent(
        new CustomEvent('collabflow:team-chat-message', {
          detail: {
            message,
            channelId,
            channelName:
              (payload as Record<string, unknown>)?.channel_name ??
              (payload as Record<string, unknown>)?.channel?.name ??
              message.channel?.name,
          },
        })
      );
    };

    const dispatchReadReceipt = (
      type: 'read' | 'delivered',
      payload: unknown,
      fallbackChannelId: number | null = null
    ) => {
      const raw = (payload ?? {}) as Record<string, unknown>;
      const data =
        raw.channel_id != null || raw.message_id != null || raw.last_read_message_id != null
          ? raw
          : (raw.data as Record<string, unknown>) ?? raw;
      const channelId =
        data.channel_id ??
        data.channelId ??
        fallbackChannelId;
      window.dispatchEvent(
        new CustomEvent(`collabflow:team-chat-${type}`, {
          detail: { ...data, channel_id: channelId },
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
            new CustomEvent('collabflow:task-assigned', {
              detail: { task },
            })
          );
        },
        onTaskActivity: (payload) => {
          if (!payload) return;
          window.dispatchEvent(
            new CustomEvent('collabflow:task-activity', {
              detail: payload,
            })
          );
        },
        onTaskUpdated: (payload) => {
          const task = payload?.task ?? payload;
          if (!task?.id) return;
          window.dispatchEvent(
            new CustomEvent('collabflow:task-updated', {
              detail: { task },
            })
          );
        },
        onMeetingCallIncoming: (payload) => {
          const raw = (payload ?? {}) as Record<string, unknown>;
          const data =
            (raw.data as Record<string, unknown>) ?? raw;
          const meetingId =
            data.meeting_id ?? data.meetingId ?? data.uuid;
          if (!meetingId) return;

          const caller =
            (data.caller as { id?: unknown; name?: string } | undefined) ??
            undefined;
          const title =
            typeof data.title === 'string' ? data.title : 'Team Chat call';
          const callMode =
            data.call_mode === 'audio' ? 'audio' : 'video';

          window.dispatchEvent(
            new CustomEvent('collabflow:meeting-call-incoming', {
              detail: {
                meeting_id: String(meetingId),
                title,
                caller,
                call_mode: callMode,
              },
            })
          );

          void showAppNotification({
            title:
              callMode === 'audio'
                ? `Voice call from ${caller?.name || 'Team member'}`
                : `Video call from ${caller?.name || 'Team member'}`,
            body: title,
            route: `/meetings/${meetingId}`,
            silent: true,
          });
        },
      });
      try {
        const response = await teamChatBootstrap();
        if (currentGeneration !== generation) return;
        const { channels } = parseBootstrap(response);
        subscribeTeamChatGlobalChannels(
          channels.map((channel) => channel.id).filter((id) => id != null),
          {
            onMessage: dispatchIncoming,
            onMessageRead: (payload, channelId) =>
              dispatchReadReceipt('read', payload, channelId),
            onMessageDelivered: (payload, channelId) =>
              dispatchReadReceipt('delivered', payload, channelId),
          }
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

    window.addEventListener('collabflow:session-authenticated', onAuthenticated);
    window.addEventListener('collabflow:session-logged-out', onLoggedOut);
    void startSubscriptions();

    return () => {
      generation += 1;
      window.removeEventListener('collabflow:session-authenticated', onAuthenticated);
      window.removeEventListener('collabflow:session-logged-out', onLoggedOut);
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
              new CustomEvent('collabflow:team-chat-message', {
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
          new CustomEvent('collabflow:team-chat-unread', {
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
      <IncomingCallOverlay />
      <EirmonAiWidget />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 5000,
          icon: getToastLogoIcon(),
          className: 'eirmon-toast',
        }}
      />
      <Routes>
        <Route
          path="/"
          element={
            getToken() ? <Navigate to="/home" /> : <Navigate to="/login" />
          }
        />

        <Route path="/login" element={<Suspense fallback={<LoadingFallback />}><Login /></Suspense>} />

        <Route
          path="/unauthorized"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingFallback />}><Unauthorized /></Suspense>
            </ProtectedRoute>
          }
        />

        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_DASHBOARD]}>
                <Suspense fallback={<LoadingFallback />}><Home /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_TASKS]}>
                <Suspense fallback={<LoadingFallback />}><TaskManagement /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/tasks/create"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.CREATE_TASKS]}>
                <Suspense fallback={<LoadingFallback />}><TaskCreate /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/leave-requests"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_ATTENDANCE]}>
                <Suspense fallback={<LoadingFallback />}><LeaveRequests /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/attendance"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_ATTENDANCE]}>
                <Suspense fallback={<LoadingFallback />}><AttendanceDashboard /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/budgets"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_BUDGETS, P.MANAGE_BUDGETS]}>
                <Suspense fallback={<LoadingFallback />}><Budgetsindex /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/budgets/create"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.MANAGE_BUDGETS, P.CREATE_BUDGETS]}>
                <Suspense fallback={<LoadingFallback />}><BudgetForm /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/budgets/:id/edit"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.MANAGE_BUDGETS, P.EDIT_BUDGETS]}>
                <Suspense fallback={<LoadingFallback />}><BudgetForm /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/expense"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_EXPENSES]}>
                <Suspense fallback={<LoadingFallback />}><Expensesindex /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/expense/create"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.CREATE_EXPENSES]}>
                <Suspense fallback={<LoadingFallback />}><ExpenseCreate /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/expense/:id/edit"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.CREATE_EXPENSES, P.EDIT_EXPENSES]}>
                <Suspense fallback={<LoadingFallback />}><ExpenseCreate /></Suspense>
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
                <Suspense fallback={<LoadingFallback />}><ExpenseCategories /></Suspense>
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
                <Suspense fallback={<LoadingFallback />}><ExpenseCategoryCreate /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/expense/:id"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_EXPENSES]}>
                <Suspense fallback={<LoadingFallback />}><ExpenseDetail /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/rough-work"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_DASHBOARD]}>
                <Suspense fallback={<LoadingFallback />}><RoughWorkNotepad /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingFallback />}><Profile /></Suspense>
            </ProtectedRoute>
          }
        />

        <Route
          path="/team-chat"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_TEAM_CHAT, P.MANAGE_TEAM_CHAT]}>
                <Suspense fallback={<LoadingFallback />}><TeamChat /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/team-chat/:channelId"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.VIEW_TEAM_CHAT, P.MANAGE_TEAM_CHAT]}>
                <Suspense fallback={<LoadingFallback />}><TeamChat /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/eirmon-ai"
          element={
            <ProtectedRoute>
              <PermissionRoute anyOf={[P.USE_EIRMON_AI, P.USE_AI_MARKETING_ASSISTANT]}>
                <Suspense fallback={<LoadingFallback />}><EirmonAi /></Suspense>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route path="/meetings" element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_DASHBOARD]}>
              <Suspense fallback={<LoadingFallback />}><MeetingsPage /></Suspense>
            </PermissionRoute>
          </ProtectedRoute>
        } />
        <Route path="/meetings/create" element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_DASHBOARD]}>
              <Suspense fallback={<LoadingFallback />}><CreateMeetingPage /></Suspense>
            </PermissionRoute>
          </ProtectedRoute>
        } />
        <Route path="/meetings/:uuid" element={
          <ProtectedRoute>
            <PermissionRoute anyOf={[P.VIEW_DASHBOARD]}>
              <RouteErrorBoundary>
                <Suspense fallback={<LoadingFallback label="Opening meeting…" />}>
                  <MeetingRoomPage />
                </Suspense>
              </RouteErrorBoundary>
            </PermissionRoute>
          </ProtectedRoute>
        } />
      </Routes>
    </>
  );
}

export default App;