import { useState } from "react";

export default function ScriptUpload() {
  const [scriptText, setScriptText] = useState("");

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith(".txt")) {
      alert("Please upload a .txt file only (for now).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setScriptText(event.target.result);
    };
    reader.readAsText(file);
  };

  return (
    <div className="upload">
      <h3>Upload Script (Local Only)</h3>
      <input type="file" accept=".txt" onChange={handleFileUpload} />
      {scriptText && <pre className="script-preview">{scriptText}</pre>}
    </div>
  );
}
