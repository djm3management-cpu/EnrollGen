import { MessageSquareQuote } from "lucide-react";
import { useObjectionHandler } from "../hooks/useObjectionHandler";
import "../ObjectionHandler.css";
import { QuickButtons } from "./objection/QuickButtons";
import { ObjectionInput } from "./objection/ObjectionInput";
import { ResponseCard } from "./objection/ResponseCard";
import { RebuttalHistory } from "./objection/RebuttalHistory";

export default function ObjectionHandler() {
  const {
    input, setInput, response, setResponse,
    loading, history, inputRef,
    handleSubmit, copyRebuttal,
  } = useObjectionHandler();

  return (
    <div className="objection-handler">
      <div className="objection-handler-header">
        <span className="objection-handler-icon" style={{ display: "inline-flex", alignItems: "center" }}>
          <MessageSquareQuote size={18} />
        </span>
        <div>
          <h3 style={{ margin: 0, fontSize: "1em" }}>Objection Handler</h3>
          <span style={{ fontSize: "0.75em", opacity: 0.6 }}>
            Type what the client said &rarr; get exact rebuttal
          </span>
        </div>
      </div>

      <QuickButtons onSelect={handleSubmit} disabled={loading} />

      <ObjectionInput
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        loading={loading}
        inputRef={inputRef}
      />

      {loading && (
        <div className="objection-loading">
          <span className="prompter-pulse">&bull;</span> Getting rebuttal...
        </div>
      )}

      {!loading && <ResponseCard response={response} onCopy={copyRebuttal} />}

      <RebuttalHistory history={history} onSelect={setResponse} />
    </div>
  );
}
