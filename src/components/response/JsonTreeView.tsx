import { Component, For, createSignal, createMemo } from "solid-js";

// --- Postman-style line-based JSON renderer ---

export interface JsonLine {
  indent: number;
  content: LineContent[];
  collapsible: boolean;
  collapsedPreview?: string;
  groupId?: number;
  isClose?: boolean;
}

export type LineContent =
  | { type: "key"; text: string }
  | { type: "string"; text: string }
  | { type: "number"; text: string }
  | { type: "boolean"; text: string }
  | { type: "null" }
  | { type: "bracket"; text: string }
  | { type: "colon" }
  | { type: "comma" }
  | { type: "space" };

let groupCounter = 0;

export function jsonToLines(value: unknown, indent: number, isLast: boolean): JsonLine[] {
  const lines: JsonLine[] = [];

  if (value === null) {
    lines.push({
      indent,
      content: [{ type: "null" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
      collapsible: false,
    });
  } else if (typeof value === "string") {
    lines.push({
      indent,
      content: [{ type: "string", text: `"${value}"` }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
      collapsible: false,
    });
  } else if (typeof value === "number") {
    lines.push({
      indent,
      content: [{ type: "number", text: String(value) }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
      collapsible: false,
    });
  } else if (typeof value === "boolean") {
    lines.push({
      indent,
      content: [{ type: "boolean", text: String(value) }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
      collapsible: false,
    });
  } else if (Array.isArray(value)) {
    const gid = ++groupCounter;
    if (value.length === 0) {
      lines.push({
        indent,
        content: [{ type: "bracket", text: "[]" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
        collapsible: false,
      });
    } else {
      lines.push({
        indent,
        content: [{ type: "bracket", text: "[" }],
        collapsible: true,
        collapsedPreview: `${value.length} items`,
        groupId: gid,
      });
      for (let i = 0; i < value.length; i++) {
        const childLines = jsonToLines(value[i], indent + 1, i === value.length - 1);
        for (const cl of childLines) {
          cl.groupId = cl.groupId || gid;
        }
        lines.push(...childLines);
      }
      lines.push({
        indent,
        content: [{ type: "bracket", text: "]" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
        collapsible: false,
        groupId: gid,
        isClose: true,
      });
    }
  } else if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    const gid = ++groupCounter;
    if (entries.length === 0) {
      lines.push({
        indent,
        content: [{ type: "bracket", text: "{}" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
        collapsible: false,
      });
    } else {
      lines.push({
        indent,
        content: [{ type: "bracket", text: "{" }],
        collapsible: true,
        collapsedPreview: `${entries.length} keys`,
        groupId: gid,
      });
      for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i];
        const last = i === entries.length - 1;
        // For primitives & empty collections, render key: value on one line
        if (v === null || typeof v !== "object" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && Object.keys(v as object).length === 0)) {
          const valContent = renderValueInline(v);
          lines.push({
            indent: indent + 1,
            content: [
              { type: "key", text: `"${k}"` },
              { type: "colon" },
              { type: "space" },
              ...valContent,
              ...(last ? [] : [{ type: "comma" } as LineContent]),
            ],
            collapsible: false,
            groupId: gid,
          });
        } else {
          // Complex value: key: on the open line, then nested
          const childLines = jsonToLines(v, indent + 1, last);
          if (childLines.length > 0) {
            // Merge key onto the opening bracket line
            const first = childLines[0];
            first.content = [
              { type: "key", text: `"${k}"` },
              { type: "colon" },
              { type: "space" },
              ...first.content,
            ];
            for (const cl of childLines) {
              cl.groupId = cl.groupId || gid;
            }
            lines.push(...childLines);
          }
        }
      }
      lines.push({
        indent,
        content: [{ type: "bracket", text: "}" }, ...(isLast ? [] : [{ type: "comma" } as LineContent])],
        collapsible: false,
        groupId: gid,
        isClose: true,
      });
    }
  }

  return lines;
}

function renderValueInline(v: unknown): LineContent[] {
  if (v === null) return [{ type: "null" }];
  if (typeof v === "string") return [{ type: "string", text: `"${v}"` }];
  if (typeof v === "number") return [{ type: "number", text: String(v) }];
  if (typeof v === "boolean") return [{ type: "boolean", text: String(v) }];
  if (Array.isArray(v) && v.length === 0) return [{ type: "bracket", text: "[]" }];
  if (typeof v === "object" && v !== null && Object.keys(v).length === 0) return [{ type: "bracket", text: "{}" }];
  return [{ type: "string", text: String(v) }];
}

const ContentSpan: Component<{ c: LineContent }> = (props) => {
  switch (props.c.type) {
    case "key": return <span class="json-key">{props.c.text}</span>;
    case "string": return <span class="json-string">{props.c.text}</span>;
    case "number": return <span class="json-number">{props.c.text}</span>;
    case "boolean": return <span class="json-boolean">{props.c.text}</span>;
    case "null": return <span class="json-null">null</span>;
    case "bracket": return <span class="json-bracket">{props.c.text}</span>;
    case "colon": return <span class="json-colon">:</span>;
    case "comma": return <span class="json-comma">,</span>;
    case "space": return <span>{"\u00A0"}</span>;
    default: return null;
  }
};

export function resetGroupCounter() {
  groupCounter = 0;
}

export const JsonTreeView: Component<{ data: unknown }> = (props) => {
  const allLines = createMemo(() => {
    groupCounter = 0;
    return jsonToLines(props.data, 0, true);
  });

  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<number>>(new Set());

  const toggleGroup = (gid: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  const visibleLines = createMemo(() => {
    const lines = allLines();
    const collapsed = collapsedGroups();
    const result: { line: JsonLine; lineNum: number }[] = [];
    let hideDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (hideDepth > 0) {
        // We're inside a collapsed section — track nesting to find the matching closer
        if (line.collapsible) hideDepth++;
        if (line.isClose) hideDepth--;
        // This line stays hidden (including the closing bracket)
        continue;
      }

      // This line is visible
      result.push({ line, lineNum: i + 1 });

      // If this is a collapsed opener, start hiding everything after it
      if (line.collapsible && line.groupId !== undefined && collapsed.has(line.groupId)) {
        hideDepth = 1;
      }
    }
    return result;
  });

  const INDENT_WIDTH = 20;

  return (
    <div class="json-tree">
      <For each={visibleLines()}>
        {({ line, lineNum }) => {
          const isCollapsed = () => line.collapsible && line.groupId !== undefined && collapsedGroups().has(line.groupId);
          return (
            <div class="json-line">
              <span class="json-gutter">
                <span class="json-line-num">{lineNum}</span>
                <span class="json-arrow-slot">
                  {line.collapsible && (
                    <span class={`json-arrow ${isCollapsed() ? "collapsed" : ""}`} onClick={() => line.groupId !== undefined && toggleGroup(line.groupId)}>
                      {isCollapsed() ? "▶" : "▼"}
                    </span>
                  )}
                </span>
              </span>
              <span class="json-line-body">
                {/* Indent guides */}
                {line.indent > 0 && (
                  <span class="json-indent-guides" style={{ width: `${line.indent * INDENT_WIDTH}px` }}>
                    {Array.from({ length: line.indent }, (_, i) => (
                      <span class="json-indent-guide" style={{ left: `${i * INDENT_WIDTH + 4}px` }} />
                    ))}
                  </span>
                )}
                <span class="json-line-content">
                  <For each={line.content}>
                    {(c) => <ContentSpan c={c} />}
                  </For>
                  {isCollapsed() && (
                    <>
                      <span class="json-collapsed" onClick={() => line.groupId !== undefined && toggleGroup(line.groupId)}>
                        {line.collapsedPreview}
                      </span>
                      <span class="json-bracket">{line.content[line.content.length - 1]?.type === "bracket" && (line.content[line.content.length - 1] as any).text === "[" ? "]" : "}"}</span>
                    </>
                  )}
                </span>
              </span>
            </div>
          );
        }}
      </For>
    </div>
  );
};
