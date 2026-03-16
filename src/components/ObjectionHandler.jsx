import { useState } from "react";
import { MessageSquareQuote } from "lucide-react";
import { useObjectionHandler } from "../hooks/useObjectionHandler";
import { OBJECTION_CATEGORIES } from "../data/objectionData";
import "../ObjectionHandler.css";
import { CategoryList } from "./objection/CategoryList";
import { ObjectionAnalysis } from "./objection/ObjectionAnalysis";
import { RebuttalPanel } from "./objection/RebuttalPanel";
import { ObjectionInput } from "./objection/ObjectionInput";

export default function ObjectionHandler() {
  const {
    input, setInput, response, setResponse,
    loading, inputRef,
    handleSubmit, copyRebuttal,
  } = useObjectionHandler();

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedObjection, setSelectedObjection] = useState(null);

  const handleSelectObjection = (obj) => {
    setSelectedObjection(obj);
    setResponse(null); // clear AI response when switching to structured data
  };

  return (
    <div className="objection-handler">
      <div className="objection-handler-header">
        <span className="objection-handler-icon" style={{ display: "inline-flex", alignItems: "center" }}>
          <MessageSquareQuote size={18} />
        </span>
        <div>
          <h3 style={{ margin: 0, fontSize: "1em" }}>Objection Handler</h3>
          <span style={{ fontSize: "0.75em", opacity: 0.6 }}>
            Select an objection or type what the client said
          </span>
        </div>
      </div>

      {/* Custom input row — always visible above the 3 columns */}
      <ObjectionInput
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        loading={loading}
        inputRef={inputRef}
      />

      {/* 3-column tactical layout */}
      <div className="objection-3col">
        {/* Left — categories + objection list */}
        <CategoryList
          categories={OBJECTION_CATEGORIES}
          selectedCategory={selectedCategory}
          selectedObjection={selectedObjection}
          onSelectCategory={setSelectedCategory}
          onSelectObjection={handleSelectObjection}
        />

        {/* Center — selected objection analysis */}
        <ObjectionAnalysis objection={selectedObjection} />

        {/* Right — response tree + copy + AI response */}
        <RebuttalPanel
          objection={selectedObjection}
          aiResponse={response}
          aiLoading={loading}
          onCopy={copyRebuttal}
        />
      </div>
    </div>
  );
}
