import { Component, For, Show, createSignal, createMemo, onMount, onCleanup, createEffect } from "solid-js";
import { tabs, activeTabId, setActiveTabId, closeTab, createNewTab, closeAllTabs, closeOtherTabs, type Tab } from "../../stores/request";
import { globalVars, saveGlobalVars, loadGlobalVars } from "../../stores/globals";
import { KeyValueGrid } from "../shared/KeyValueGrid";

const METHOD_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export const TabBar: Component = () => {
  let tabListRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;
  const [canScrollLeft, setCanScrollLeft] = createSignal(false);
  const [canScrollRight, setCanScrollRight] = createSignal(false);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [groupByMethod, setGroupByMethod] = createSignal(false);
  const [showGlobals, setShowGlobals] = createSignal(false);
  const [collapsedMethods, setCollapsedMethods] = createSignal<Set<string>>(new Set());
  const [showSearch, setShowSearch] = createSignal(false);
  const [tabSearch, setTabSearch] = createSignal("");

  const checkOverflow = () => {
    if (!tabListRef) return;
    setCanScrollLeft(tabListRef.scrollLeft > 0);
    setCanScrollRight(tabListRef.scrollLeft + tabListRef.clientWidth < tabListRef.scrollWidth - 1);
  };

  onMount(() => {
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    if (tabListRef) observer.observe(tabListRef);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    tabs();
    setTimeout(checkOverflow, 0);
  });

  const scrollLeft = () => {
    tabListRef?.scrollBy({ left: -200, behavior: "smooth" });
  };

  const scrollRight = () => {
    tabListRef?.scrollBy({ left: 200, behavior: "smooth" });
  };

  const handleScroll = () => checkOverflow();

  const toggleMethodCollapse = (method: string) => {
    setCollapsedMethods(prev => {
      const next = new Set(prev);
      if (next.has(method)) next.delete(method);
      else next.add(method);
      return next;
    });
  };

  const filteredTabs = createMemo(() => {
    const q = tabSearch().toLowerCase().trim();
    if (!q) return tabs();
    return tabs().filter(t => t.name.toLowerCase().includes(q));
  });

  const groupedTabs = createMemo((): { label: string; tabs: Tab[]; total: number }[] => {
    const source = filteredTabs();
    if (!groupByMethod()) return [{ label: "", tabs: source, total: source.length }];
    const groups = new Map<string, Tab[]>();
    for (const tab of source) {
      const method = tab.method.toUpperCase();
      if (!groups.has(method)) groups.set(method, []);
      groups.get(method)!.push(tab);
    }
    return METHOD_ORDER
      .filter(m => groups.has(m))
      .map(m => ({ label: m, tabs: groups.get(m)!, total: groups.get(m)!.length }))
      .concat(
        [...groups.entries()]
          .filter(([m]) => !METHOD_ORDER.includes(m))
          .map(([m, t]) => ({ label: m, tabs: t, total: t.length }))
      );
  });

  const toggleSearch = () => {
    const next = !showSearch();
    setShowSearch(next);
    if (next) {
      setTimeout(() => searchInputRef?.focus(), 0);
    } else {
      setTabSearch("");
    }
  };

  const closeDropdownOnClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".tab-menu-container")) {
      setShowDropdown(false);
    }
  };

  const closeGlobalsOnClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".global-vars-container")) {
      setShowGlobals(false);
    }
  };

  onMount(() => {
    loadGlobalVars();
    document.addEventListener("click", closeDropdownOnClick);
    document.addEventListener("click", closeGlobalsOnClick);
    onCleanup(() => {
      document.removeEventListener("click", closeDropdownOnClick);
      document.removeEventListener("click", closeGlobalsOnClick);
    });
  });

  return (
    <div class="tab-bar">
      <Show when={canScrollLeft()}>
        <button class="tab-scroll-btn" onClick={scrollLeft} title="Scroll left">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="8 2 4 6 8 10" />
          </svg>
        </button>
      </Show>

      <Show when={showSearch()}>
        <div class="tab-search-container">
          <svg class="tab-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            class="tab-search-input"
            type="text"
            placeholder="Filter tabs..."
            value={tabSearch()}
            onInput={(e) => setTabSearch(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Escape") toggleSearch(); }}
          />
          <Show when={tabSearch()}>
            <button class="tab-search-clear" onClick={() => setTabSearch("")}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </Show>
        </div>
      </Show>

      <div class="tab-list" ref={tabListRef} onScroll={handleScroll}>
        <For each={groupedTabs()}>
          {(group) => (
            <>
              <Show when={groupByMethod() && group.label}>
                <div
                  class={`tab-group-divider ${collapsedMethods().has(group.label) ? "collapsed" : ""}`}
                  onClick={() => toggleMethodCollapse(group.label)}
                >
                  <span class={`tab-group-arrow`}>
                    {collapsedMethods().has(group.label) ? "▶" : "▼"}
                  </span>
                  <span class={`tab-group-label ${group.label.toLowerCase()}`}>{group.label}</span>
                  <Show when={collapsedMethods().has(group.label)}>
                    <span class="tab-group-count">{group.total}</span>
                  </Show>
                </div>
              </Show>
              <Show when={!groupByMethod() || !collapsedMethods().has(group.label)}>
                <For each={group.tabs}>
                  {(tab) => (
                    <div
                      class={`tab-item ${tab.id === activeTabId() ? "active" : ""}`}
                      onClick={() => setActiveTabId(tab.id)}
                      onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } }}
                    >
                      <span class={`tab-method ${tab.method.toLowerCase()}`}>
                        {tab.method}
                      </span>
                      <span class="tab-name">{tab.name}</span>
                      <Show when={tab.dirty}>
                        <span class="tab-dirty">●</span>
                      </Show>
                      <button
                        class="tab-close"
                        onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                          <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
                        </svg>
                      </button>
                    </div>
                  )}
                </For>
              </Show>
            </>
          )}
        </For>
      </div>

      <Show when={canScrollRight()}>
        <button class="tab-scroll-btn" onClick={scrollRight} title="Scroll right">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 2 8 6 4 10" />
          </svg>
        </button>
      </Show>

      <button class="tab-new" onClick={() => createNewTab()} title="New tab">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="7" y1="2" x2="7" y2="12" /><line x1="2" y1="7" x2="12" y2="7" />
        </svg>
      </button>

      <button class={`tab-new ${showSearch() ? "active" : ""}`} onClick={toggleSearch} title="Search tabs">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      <div class="global-vars-container">
        <button
          class="global-vars-btn"
          onClick={() => setShowGlobals(!showGlobals())}
          title="Global Variables"
        >
          {"{ }"}
          <Show when={globalVars().filter(v => v.enabled && v.key).length > 0}>
            <span class="global-vars-badge">{globalVars().filter(v => v.enabled && v.key).length}</span>
          </Show>
        </button>
        <Show when={showGlobals()}>
          <div class="dropdown global-vars-popover">
            <div class="global-vars-header">
              <span>Global Variables</span>
              <Show when={globalVars().length > 0}>
                <span class="global-vars-count">{globalVars().length}</span>
              </Show>
            </div>
            <KeyValueGrid
              items={globalVars()}
              onChange={(items) => saveGlobalVars(items)}
              placeholder={{ key: "VARIABLE_NAME", value: "value" }}
            />
          </div>
        </Show>
      </div>

      <div class="tab-menu-container">
        <button
          class="tab-new"
          onClick={() => setShowDropdown(!showDropdown())}
          title="Tab options"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="7" cy="3" r="1" fill="currentColor" /><circle cx="7" cy="7" r="1" fill="currentColor" /><circle cx="7" cy="11" r="1" fill="currentColor" />
          </svg>
        </button>
        <Show when={showDropdown()}>
          <div class="dropdown tab-dropdown">
            <button
              class="dropdown-item"
              onClick={() => { closeAllTabs(); setShowDropdown(false); }}
            >
              Close All Tabs
            </button>
            <Show when={activeTabId()}>
              <button
                class="dropdown-item"
                onClick={() => { closeOtherTabs(activeTabId()!); setShowDropdown(false); }}
              >
                Close Other Tabs
              </button>
            </Show>
            <div class="dropdown-sep" />
            <button
              class={`dropdown-item ${groupByMethod() ? "active" : ""}`}
              onClick={() => { setGroupByMethod(!groupByMethod()); setCollapsedMethods(new Set<string>()); setShowDropdown(false); }}
            >
              {groupByMethod() ? "✓ " : ""}Group by Method
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};
