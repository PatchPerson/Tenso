import { Component, For, createSignal, createEffect, onMount, JSX } from "solid-js";

interface Props<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  renderItem: (item: T, index: number) => JSX.Element;
  class?: string;
}

export function VirtualList<T>(props: Props<T>) {
  let containerRef: HTMLDivElement | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(400);
  const overscan = () => props.overscan ?? 5;

  onMount(() => {
    if (containerRef) {
      setContainerHeight(containerRef.clientHeight);
      const observer = new ResizeObserver((entries) => {
        setContainerHeight(entries[0].contentRect.height);
      });
      observer.observe(containerRef);
    }
  });

  const totalHeight = () => props.items.length * props.itemHeight;
  const startIndex = () => Math.max(0, Math.floor(scrollTop() / props.itemHeight) - overscan());
  const endIndex = () => Math.min(
    props.items.length,
    Math.ceil((scrollTop() + containerHeight()) / props.itemHeight) + overscan()
  );
  const visibleItems = () => props.items.slice(startIndex(), endIndex());

  return (
    <div
      ref={containerRef}
      class={`virtual-list ${props.class || ""}`}
      style={{ overflow: "auto", height: "100%" }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: `${totalHeight()}px`, position: "relative" }}>
        <div style={{ position: "absolute", top: `${startIndex() * props.itemHeight}px`, width: "100%" }}>
          <For each={visibleItems()}>
            {(item, i) => props.renderItem(item, startIndex() + i())}
          </For>
        </div>
      </div>
    </div>
  );
}
