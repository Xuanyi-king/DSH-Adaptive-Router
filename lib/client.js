// Minimal native-slot display; DSH's committed header is the authority.
window.__ModuleLoader__.load({
  id: "dsh-plugin-adaptive-router",
  factory: (require) => {
    const React = require("react");
    const runtime = require("@deepseek-ai/dsh-client-store");
    function Chip(props) {
      const state = props.useProjection("adaptiveRouter");
      const connection = props.useAdaptiveConnection((c) => c);
      const [status, setStatus] = React.useState(null);
      React.useEffect(() => {
        let cancelled = false;
        setStatus(null);
        if (!connection || !props.sessionId) return;
        connection.rpc
          .call("/api", "adaptiveRouter/getSessionState", {
            args: { sessionId: props.sessionId },
          })
          .then((result) => {
            if (!cancelled && result?.ok) setStatus(result.value);
          })
          .catch(() => {});
        return () => {
          cancelled = true;
        };
      }, [connection, props.sessionId, state?.tick]);
      if (!state?.actual || !status?.enabled) return null;
      const actual = state.actual;
      const decision = status.decision;
      const selected = decision?.selection;
      const matches =
        !selected ||
        (selected.provider === actual.provider &&
          selected.model === actual.model &&
          selected.reasoningEffort === actual.reasoningEffort);
      const control = status.conflict
        ? "Conflict"
        : matches
          ? decision?.control || "Native"
          : "Native";
      const reason = matches
        ? decision?.reason
        : "another controller changed the request";
      return React.createElement(
        "span",
        {
          title: `${actual.provider}/${actual.model}${reason ? " · " + reason : ""}`,
          style: { fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" },
        },
        `${control} · ${actual.model} · ${actual.reasoningEffort || "Default"}`,
      );
    }
    return {
      inject: ["slots", "connection"],
      apply(ctx) {
        const connection = runtime.createSnapshotStore(ctx.connection);
        ctx.slots.inject("conversation.input.right", () =>
          ctx.slots.register(
            {
              name: "conversation.input.right",
              id: "adaptive-router",
              order: 51,
              inject: () => ({ hooks: { adaptiveConnection: connection } }),
            },
            Chip,
          ),
        );
      },
    };
  },
});
