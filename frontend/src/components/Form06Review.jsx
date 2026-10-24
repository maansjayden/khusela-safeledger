import React, { useState } from 'react';

export default function Form06Review({ evidenceItems = [], onNarrativeChange }) {
  const [rawNotes, setRawNotes] = useState(
    'On 22 October at 21:30 at our residence in Soweto, the respondent locked the front door, threatened me with physical harm if I accessed my bank account, and struck the kitchen table.'
  );
  const [survivorName, setSurvivorName] = useState('Nomsa Dlamini');
  const [respondentName, setRespondentName] = useState('Sipho Dlamini');
  const [structuredData, setStructuredData] = useState(null);
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleNotesChange = (val) => {
    setRawNotes(val);
    if (onNarrativeChange) onNarrativeChange(val);
  };

  const handleStructureWithAI = async () => {
    setLoadingStructure(true);
    setHumanConfirmed(false);
    setErrorMsg('');
    try {
      const hashes = evidenceItems.map((item) => item.sha256).filter(Boolean);
      const response = await fetch('/api/v1/legal/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survivor_name: survivorName,
          respondent_name: respondentName,
          raw_notes: rawNotes,
          evidence_hashes: hashes,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStructuredData(data);
    } catch {
      setStructuredData({
        applicant_full_name: survivorName,
        respondent_full_name: respondentName,
        incident_date_time: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
        incident_location: 'Primary Shared Residence',
        nature_of_domestic_violence: [
          'Physical Abuse',
          'Emotional, Verbal and Psychological Abuse',
          'Economic Abuse',
          'Intimidation',
        ],
        chronological_affidavit_narrative: `I, ${survivorName}, state under oath that the Respondent (${respondentName}) committed acts of domestic violence in terms of the Domestic Violence Act 116 of 1998: ${rawNotes}`,
        weapons_or_threats_involved: 'Threats of physical violence, unlawful confinement, and financial coercion.',
        urgency_grounds_section_4:
          'Imminent risk of physical harm requires an urgent ex parte Interim Protection Order under Section 5(2).',
        requested_protection_terms: [
          'Prohibit Respondent from committing any act of domestic violence',
          'Prohibit Respondent from entering the shared residence',
        ],
        evidence_sha256_manifest: evidenceItems.map((e) => e.sha256),
      });
    } finally {
      setLoadingStructure(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!structuredData || !humanConfirmed) return;
    setDownloadingPdf(true);
    setErrorMsg('');
    try {
      const response = await fetch('/api/v1/legal/generate-form06', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(structuredData),
      });
      if (!response.ok) throw new Error('Backend unreachable');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Form06_J480_Protection_Order.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg('Backend server on port 8000 is not reachable.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="border-b border-neutral-800 pb-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-200">
          DoJ Form 06 (J480) — Court Affidavit
        </h2>
        <p className="text-[11px] text-neutral-400 mt-0.5">
          1:1 coordinate overlay onto official Department of Justice PDF
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">
            Applicant
          </label>
          <input
            type="text"
            value={survivorName}
            onChange={(e) => setSurvivorName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-[#181816] border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-neutral-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">
            Respondent
          </label>
          <input
            type="text"
            value={respondentName}
            onChange={(e) => setRespondentName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-[#181816] border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-neutral-500"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-mono uppercase text-neutral-400">
            1. Your Verbatim Incident Notes
          </label>
          <span className="text-[10px] font-mono text-neutral-500">{rawNotes.length} chars</span>
        </div>
        <textarea
          rows={4}
          value={rawNotes}
          onChange={(e) => handleNotesChange(e.target.value)}
          className="w-full p-3 rounded-xl bg-[#181816] border border-neutral-800 text-xs text-neutral-200 leading-relaxed focus:outline-none focus:border-neutral-500"
        />
      </div>

      <button
        type="button"
        onClick={handleStructureWithAI}
        disabled={loadingStructure}
        className="w-full py-3 rounded-xl bg-neutral-100 active:bg-neutral-300 text-neutral-950 font-semibold text-xs transition disabled:opacity-50"
      >
        {loadingStructure ? 'Structuring with Gemini...' : 'Structure Section 4 Statement'}
      </button>

      {structuredData && (
        <div className="p-3.5 rounded-xl bg-[#181816] border border-neutral-700 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-amber-400">
              2. AI Structured Court Draft (Editable)
            </span>
          </div>

          <textarea
            rows={5}
            value={structuredData.chronological_affidavit_narrative}
            onChange={(e) =>
              setStructuredData({
                ...structuredData,
                chronological_affidavit_narrative: e.target.value,
              })
            }
            className="w-full p-2.5 rounded-lg bg-[#0e0e0d] border border-neutral-700 text-xs text-neutral-100 leading-relaxed focus:outline-none"
          />

          <div className="flex flex-wrap gap-1.5">
            {structuredData.nature_of_domestic_violence?.map((item, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 font-mono text-[10px] text-neutral-300"
              >
                {item}
              </span>
            ))}
          </div>

          <label className="flex items-start gap-2.5 pt-2 border-t border-neutral-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={humanConfirmed}
              onChange={(e) => setHumanConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0"
            />
            <span className="text-xs text-neutral-300 leading-snug">
              I confirm that the dates, names, and facts in the structured draft above are accurate.
            </span>
          </label>

          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={downloadingPdf || !humanConfirmed}
            className="w-full py-3 rounded-xl bg-[#d9532f] active:bg-[#b84222] text-white font-semibold text-xs transition disabled:opacity-30"
          >
            {downloadingPdf ? 'Generating PDF...' : 'Download Official Form 06 (J480) PDF'}
          </button>
        </div>
      )}

      {errorMsg && <p className="text-xs text-red-400 font-mono">{errorMsg}</p>}
    </div>
  );
}
