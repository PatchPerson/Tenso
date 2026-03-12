import { Component, Show, For, createSignal, onMount, onCleanup } from "solid-js";
import { Sidebar } from "../components/layout/Sidebar";
import { TitleBar } from "../components/layout/TitleBar";
import { TabBar } from "../components/layout/TabBar";
import { StatusBar } from "../components/layout/StatusBar";
import { RequestPanel } from "../components/request/RequestPanel";
import { ResponsePanel } from "../components/response/ResponsePanel";
import { WsMessageStream } from "../components/response/WsMessageStream";
import { EnvManager } from "../components/environments/EnvManager";
import { ImportModal, type ImportTab } from "../components/import/ImportModal";
import { Settings } from "./Settings";
import { HistoryPanel, HistoryOverlays, useHistoryCtxDismiss } from "../components/layout/HistoryPanel";
import { UpdateCheck } from "../components/shared/UpdateCheck";
import { tabs, activeTabId, getActiveTab, updateTab, executeRequest, createNewTab, saveRequest, saveAllTabs, closeTab, isWebSocketTab, connectWebSocket, sendWebSocketMessage } from "../stores/request";
import { kbd } from "../lib/platform";
import { activeTeam, activeWorkspace } from "../stores/collections";
import { loadEnvironments } from "../stores/environments";
import { loadHistory } from "../stores/history";
import * as apiTypes from "../lib/api";
import { isAuthenticated, authUser, setAuthUser, signInWithGitHub, signOut, authLoading, type AuthUser } from "../lib/auth";
import { pendingInvites, pendingInviteCount, acceptInvite, declineInvite, blockInvite } from "../lib/invites";
import { getConvexClient } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import type { Tab } from "../stores/request";

type SidePanel = "collections" | "environments" | "history" | "settings";

const SideNavIcon = (props: { type: string; active: boolean }) => {
  const icons: Record<string, string> = {
    collections: "M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z",
    environments: "M12 2L2 7L12 12L22 7L12 2ZM2 17L12 22L22 17L12 12L2 17ZM2 12L12 17L22 12L12 7L2 12Z",
    history: "M13 3C8.03 3 4 7.03 4 12H1L4.89 15.89L4.96 16.03L9 12H6C6 8.13 9.13 5 13 5C16.87 5 20 8.13 20 12C20 15.87 16.87 19 13 19C11.07 19 9.32 18.21 8.06 16.94L6.64 18.36C8.27 19.99 10.51 21 13 21C17.97 21 22 16.97 22 12C22 7.03 17.97 3 13 3ZM12 8V13L16.28 15.54L17 14.33L13.5 12.25V8H12Z",
    import: "M5 20H19V18H5V20ZM19 9H15V3H9V9H5L12 16L19 9Z",
    postman: "M20 6H12L10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6ZM14 16H6V14H14V16ZM18 12H6V10H18V12Z",
    settings: "M19.14 12.94C19.18 12.64 19.2 12.33 19.2 12C19.2 11.68 19.18 11.36 19.13 11.06L21.16 9.48C21.34 9.34 21.39 9.07 21.28 8.87L19.36 5.55C19.24 5.33 18.99 5.26 18.77 5.33L16.38 6.29C15.88 5.91 15.35 5.59 14.76 5.35L14.4 2.81C14.36 2.57 14.16 2.4 13.92 2.4H10.08C9.84 2.4 9.65 2.57 9.61 2.81L9.25 5.35C8.66 5.59 8.12 5.92 7.63 6.29L5.24 5.33C5.02 5.25 4.77 5.33 4.65 5.55L2.74 8.87C2.62 9.08 2.66 9.34 2.86 9.48L4.89 11.06C4.84 11.36 4.8 11.69 4.8 12C4.8 12.31 4.82 12.64 4.87 12.94L2.85 14.52C2.67 14.66 2.62 14.93 2.73 15.13L4.65 18.45C4.77 18.67 5.02 18.74 5.24 18.67L7.63 17.71C8.13 18.09 8.66 18.41 9.25 18.65L9.61 21.19C9.65 21.43 9.84 21.6 10.08 21.6H13.92C14.16 21.6 14.36 21.43 14.39 21.19L14.75 18.65C15.34 18.41 15.88 18.09 16.37 17.71L18.76 18.67C18.98 18.75 19.23 18.67 19.35 18.45L21.27 15.13C21.39 14.91 21.34 14.66 21.15 14.52L19.14 12.94ZM12 15.6C10.02 15.6 8.4 13.98 8.4 12C8.4 10.02 10.02 8.4 12 8.4C13.98 8.4 15.6 10.02 15.6 12C15.6 13.98 13.98 15.6 12 15.6Z",
  };

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={props.active ? "var(--accent)" : "currentColor"}>
      <path d={icons[props.type]} />
    </svg>
  );
};

export const MainWorkspace: Component = () => {
  const [sidePanel, setSidePanel] = createSignal<SidePanel>("collections");
  const [sidebarWidth, setSidebarWidth] = createSignal(280);
  const [showImportModal, setShowImportModal] = createSignal<ImportTab | null>(null);
  const [showUserPopover, setShowUserPopover] = createSignal(false);
  let popoverRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (showUserPopover() && popoverRef && !popoverRef.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest(".sidebar-nav-avatar-btn")) {
      setShowUserPopover(false);
    }
  };
  onMount(() => document.addEventListener("mousedown", handleClickOutside));
  onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));

  // History context menu dismiss handlers
  useHistoryCtxDismiss();

  const handleAcceptInvite = async (token: string) => {
    try {
      await acceptInvite(token);
      // Refresh user data to pick up new team
      const user = await getConvexClient().query(api.users.getMe, {});
      if (user) setAuthUser(user as AuthUser);
    } catch (err) {
      console.error("Accept invite failed:", err);
    }
  };
  const [splitRatio, setSplitRatio] = createSignal(0.5);
  const [resizing, setResizing] = createSignal(false);

  onMount(async () => {
    const wsId = activeTeam();
    if (wsId) {
      await loadEnvironments(wsId);
      await loadHistory(wsId);
    }

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        createNewTab();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const tab = getActiveTab();
        if (e.shiftKey) {
          saveAllTabs();
        } else if (tab) {
          saveRequest(tab.id);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        const tabId = activeTabId();
        if (tabId) closeTab(tabId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const tab = getActiveTab();
        if (tab) {
          if (isWebSocketTab(tab)) {
            if (e.shiftKey) {
              sendWebSocketMessage(tab.id);
            } else if (tab.wsStatus === "disconnected") {
              connectWebSocket(tab.id);
            }
          } else {
            executeRequest(tab.id, activeTeam());
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        setShowImportModal("curl");
      }
    });
  });

  const handleSidebarResize = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth();

    const onMove = (e: MouseEvent) => {
      const maxWidth = Math.min(500, window.innerWidth - 480);
      const newWidth = Math.max(200, Math.min(maxWidth, startWidth + e.clientX - startX));
      setSidebarWidth(newWidth);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleSplitResize = (e: MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const container = (e.target as HTMLElement).parentElement!;

    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const minLeftPx = 500;
      const minRightPx = 300;
      const minRatio = minLeftPx / rect.width;
      const maxRatio = 1 - (minRightPx / rect.width);
      const ratio = Math.max(minRatio, Math.min(maxRatio, (e.clientX - rect.left) / rect.width));
      setSplitRatio(ratio);
    };

    const onUp = () => {
      setResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const activeTab = () => getActiveTab();

  return (
    <div class="workspace">
      <TitleBar />
      <div class="workspace-sidebar" style={{ width: sidePanel() === "settings" ? "44px" : `${sidebarWidth()}px` }}>
        <div class="sidebar-nav">
          <button
            class={`sidebar-nav-btn ${sidePanel() === "collections" ? "active" : ""}`}
            onClick={() => setSidePanel("collections")}
            title="Collections"
          ><SideNavIcon type="collections" active={sidePanel() === "collections"} /></button>
          <button
            class={`sidebar-nav-btn ${sidePanel() === "environments" ? "active" : ""}`}
            onClick={() => setSidePanel("environments")}
            title="Environments"
          ><SideNavIcon type="environments" active={sidePanel() === "environments"} /></button>
          <button
            class={`sidebar-nav-btn ${sidePanel() === "history" ? "active" : ""}`}
            onClick={() => setSidePanel("history")}
            title="History"
          ><SideNavIcon type="history" active={sidePanel() === "history"} /></button>
          <div class="sidebar-nav-spacer" />
          <UpdateCheck />
          <button
            class="sidebar-nav-btn"
            onClick={() => setShowImportModal("tenso")}
            title={`Import (${kbd("Mod+I")})`}
          ><SideNavIcon type="import" active={false} /></button>
          <button
            class={`sidebar-nav-btn ${sidePanel() === "settings" ? "active" : ""}`}
            onClick={() => setSidePanel("settings")}
            title="Settings"
          ><SideNavIcon type="settings" active={sidePanel() === "settings"} /></button>

          <Show
            when={isAuthenticated()}
            fallback={
              <button
                class="sidebar-nav-btn"
                onClick={signInWithGitHub}
                disabled={authLoading()}
                title="Sign in with GitHub"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              </button>
            }
          >
            <div class="sidebar-nav-avatar-wrap">
              <button
                class="sidebar-nav-avatar-btn"
                onClick={() => setShowUserPopover(!showUserPopover())}
                title={authUser()?.name || "Account"}
              >
                <Show
                  when={authUser()?.image}
                  fallback={
                    <div class="sidebar-nav-avatar-fallback">
                      {(authUser()?.name || "U")[0].toUpperCase()}
                    </div>
                  }
                >
                  <img
                    class="sidebar-nav-avatar"
                    src={authUser()!.image!}
                    alt={authUser()?.name || "User"}
                  />
                </Show>
                <Show when={pendingInviteCount() > 0}>
                  <span class="invite-badge">{pendingInviteCount()}</span>
                </Show>
              </button>
              <Show when={showUserPopover()}>
                <div class="user-popover" ref={popoverRef}>
                  <div class="user-popover-header">
                    <Show when={authUser()?.image}>
                      <img class="user-popover-avatar" src={authUser()!.image!} alt="" />
                    </Show>
                    <div class="user-popover-info">
                      <span class="user-popover-name">{authUser()?.name || "User"}</span>
                      <span class="user-popover-email">{authUser()?.email || ""}</span>
                    </div>
                  </div>
                  <Show when={pendingInvites().length > 0}>
                    <div class="user-popover-divider" />
                    <div class="user-popover-invites">
                      <span class="user-popover-section-label">Pending invitations</span>
                      <For each={pendingInvites()}>
                        {(invite) => (
                          <div class="invite-row">
                            <div class="invite-row-info">
                              <span class="invite-team-name">{invite.teamName}</span>
                              <span class="invite-from">from {invite.inviterName}</span>
                            </div>
                            <div class="invite-row-actions">
                              <button class="invite-action-btn accept" onClick={() => handleAcceptInvite(invite.token)}>Accept</button>
                              <button class="invite-action-btn decline" onClick={() => declineInvite(invite.token)}>Decline</button>
                              <button class="invite-action-btn block" onClick={() => blockInvite(invite.token)} title="Block future invites">Block</button>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                  <div class="user-popover-divider" />
                  <button class="user-popover-action" onClick={() => { setShowUserPopover(false); signOut(); }}>
                    Sign out
                  </button>
                </div>
              </Show>
            </div>
          </Show>
        </div>

        <div class="sidebar-content" style={{ display: sidePanel() === "settings" ? "none" : undefined }}>
          <Show when={sidePanel() === "collections"}>
            <Sidebar />
          </Show>
          <Show when={sidePanel() === "environments"}>
            <EnvManager />
          </Show>
          <Show when={sidePanel() === "history"}>
            <HistoryPanel />
          </Show>
        </div>
      </div>

      <Show when={sidePanel() !== "settings"}>
        <div class="resize-handle vertical" onMouseDown={handleSidebarResize} />
      </Show>

      <div class="workspace-main">
        <Show when={sidePanel() === "settings"} fallback={
          <>
            <TabBar />
            <Show
              when={activeTab()}
              fallback={
                <div class="empty-workspace">
                  <h2>Tenso</h2>
                  <p>High-Performance API Testing</p>
                  <div class="empty-shortcuts">
                    <div class="shortcut"><span class="shortcut-keys"><kbd>{kbd("Mod")}</kbd><kbd>N</kbd></span><span class="shortcut-label">New request</span></div>
                    <div class="shortcut"><span class="shortcut-keys"><kbd>{kbd("Mod")}</kbd><kbd>Enter</kbd></span><span class="shortcut-label">Send request</span></div>
                    <div class="shortcut"><span class="shortcut-keys"><kbd>{kbd("Mod")}</kbd><kbd>S</kbd></span><span class="shortcut-label">Save request</span></div>
                    <div class="shortcut"><span class="shortcut-keys"><kbd>{kbd("Mod")}</kbd><kbd>I</kbd></span><span class="shortcut-label">Import cURL</span></div>
                  </div>
                  <button class="btn-primary" onClick={() => createNewTab()}>New Request</button>
                </div>
              }
            >
              <div class="split-pane-horizontal">
                <div class="split-left" style={{ flex: `0 0 ${splitRatio() * 100}%`, "min-width": "500px" }}>
                  <RequestPanel
                    tab={activeTab()!}
                    onUpdate={(updates) => updateTab(activeTab()!.id, updates)}
                    onSend={() => executeRequest(activeTab()!.id, activeWorkspace())}
                  />
                </div>
                <div class="resize-handle vertical split-divider" onMouseDown={handleSplitResize} />
                <div class="split-right" style={{ flex: `0 0 ${(1 - splitRatio()) * 100}%`, "min-width": "300px" }}>
                  <Show when={isWebSocketTab(activeTab()!)} fallback={
                    <ResponsePanel
                      response={activeTab()!.response}
                      loading={activeTab()!.loading}
                    />
                  }>
                    <WsMessageStream tab={activeTab()!} />
                  </Show>
                </div>
              </div>
            </Show>
          </>
        }>
          <Settings />
        </Show>
      </div>

      <StatusBar />

      <Show when={showImportModal()} keyed>
        {(tab) => (
          <ImportModal
            initialTab={tab}
            onClose={() => setShowImportModal(null)}
          />
        )}
      </Show>

      <HistoryOverlays />
    </div>
  );
};
