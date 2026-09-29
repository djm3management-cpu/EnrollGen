import { ScriptBox } from "./SharedUI";

export default function MAScriptBranches({ view, sectionKey, dispatch }) {
  const rendered = [];
  let scriptParts = [];
  const flushScript = () => {
    if (!scriptParts.length) return;
    rendered.push(
      <ScriptBox key={`script-${rendered.length}`} verbatim editable={false}>
        {scriptParts}
      </ScriptBox>
    );
    scriptParts = [];
  };

  view.items.forEach((node) => {
    if (node.type === "restriction") return;
    if (node.type === "text") {
      scriptParts.push(<span key={node.key}>{node.text}</span>, "\n\n");
      return;
    }
    if (node.type === "cue") {
      scriptParts.push(<em key={node.key} className="ma-script-cue">{node.text}</em>, "\n\n");
      return;
    }
    flushScript();
    if (node.type === "note") {
      rendered.push(<p key={node.key} className="ma-script-instruction">{node.text}</p>);
      return;
    }
    if (node.type === "close") {
      rendered.push(
        <button key={node.key} type="button" className="script-start-call-button"
          onClick={() => dispatch({ type: "CLOSE_MA_SCRIPT", outcome: node.outcome })}>
          {node.label}
        </button>
      );
      return;
    }
    if (node.type !== "choice") return;
    rendered.push(
      <fieldset className="ma-script-choice" key={node.key}>
        <legend>{node.label}</legend>
        <div className="ma-script-options">
          {node.options.map((option) => (
            <button key={option.value} type="button"
              className={`script-start-call-button ma-script-option${node.selected === option.value ? " is-active" : ""}`}
              aria-pressed={node.selected === option.value}
              onClick={() => dispatch({ type: "SET_MA_ANSWER", section: sectionKey, key: node.key, value: option.value })}>
              {node.selected === option.value ? "✓ " : ""}{option.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  });
  flushScript();
  return <div className="ma-script-branches">{rendered}</div>;
}
