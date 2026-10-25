import React, { useState } from 'react';

const DEFAULT_FIELDS = {
  applicant_surname: '',
  applicant_full_names: '',
  applicant_id_or_dob: '',
  applicant_gender: '',
  applicant_race: '',
  applicant_marital_status: '',
  applicant_phone: '',
  applicant_email: '',
  applicant_address: '',
  applicant_occupation: '',
  relationship_to_respondent: 'Current co-resident / Partner',
  respondent_surname: '',
  respondent_full_names: '',
  respondent_id_or_dob: '',
  respondent_phone: '',
  respondent_email: '',
  respondent_address: '',
  respondent_work_address: '',
  respondent_occupation: '',
  police_station: '',
  magistrates_court: '',
};

const RELATIONSHIP_OPTIONS = [
  'Current co-resident / Partner',
  'Husband',
  'Wife',
  'Boyfriend',
  'Girlfriend',
  'Ex-Partner',
  'Ex-Husband',
  'Ex-Wife',
  'Ex-Boyfriend',
  'Ex-Girlfriend',
  'Parent of child/children',
];

export default function Form06Review({
  evidenceItems = [],
  rawNotes: controlledNotes,
  onNarrativeChange,
  survivorName: controlledSurvivor,
  setSurvivorName: setControlledSurvivor,
  respondentName: controlledRespondent,
  setRespondentName: setControlledRespondent,
  form06Fields: controlledFields,
  setForm06Fields: setControlledFields,
  structuredData: controlledStructured,
  setStructuredData: setControlledStructured,
  humanConfirmed: controlledConfirmed,
  setHumanConfirmed: setControlledConfirmed,
}) {
  const [localNotes, setLocalNotes] = useState('');
  const [localSurvivor, setLocalSurvivor] = useState('');
  const [localRespondent, setLocalRespondent] = useState('');
  const [localFields, setLocalFields] = useState(DEFAULT_FIELDS);
  const [localStructured, setLocalStructured] = useState(null);
  const [localConfirmed, setLocalConfirmed] = useState(false);

  const rawNotes = controlledNotes !== undefined ? controlledNotes : localNotes;
  const survivorName = controlledSurvivor !== undefined ? controlledSurvivor : localSurvivor;
  const setSurvivorName = setControlledSurvivor || setLocalSurvivor;
  const respondentName =
    controlledRespondent !== undefined ? controlledRespondent : localRespondent;
  const setRespondentName = setControlledRespondent || setLocalRespondent;
  const fields = controlledFields !== undefined ? controlledFields : localFields;
  const setFields = setControlledFields || setLocalFields;
  const structuredData =
    controlledStructured !== undefined ? controlledStructured : localStructured;
  const setStructuredData = setControlledStructured || setLocalStructured;
  const humanConfirmed =
    controlledConfirmed !== undefined ? controlledConfirmed : localConfirmed;
  const setHumanConfirmed = setControlledConfirmed || setLocalConfirmed;

  const [loadingStructure, setLoadingStructure] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const updateField = (key, value) => {
    const next = { ...fields, [key]: value };
    setFields(next);
    if (key === 'applicant_surname' || key === 'applicant_full_names') {
      setSurvivorName(`${next.applicant_full_names} ${next.applicant_surname}`.trim());
    }
    if (key === 'respondent_surname' || key === 'respondent_full_names') {
      setRespondentName(`${next.respondent_full_names} ${next.respondent_surname}`.trim());
    }
  };

  const handleNotesChange = (val) => {
    if (controlledNotes === undefined) setLocalNotes(val);
    if (onNarrativeChange) onNarrativeChange(val);
  };

  const handleLoadSampleCase = () => {
    const sample = {
      applicant_surname: 'Khumalo',
      applicant_full_names: 'Nomsa Thandiwe',
      applicant_id_or_dob: '920415 0184 083',
      applicant_gender: 'Female',
      applicant_race: 'African',
      applicant_marital_status: 'Unmarried / Co-habiting',
      applicant_phone: '073 722 0854',
      applicant_email: 'nomsa.khumalo@example.co.za',
      applicant_address: '14 Vilakazi Street, Orlando West, Soweto',
      applicant_occupation: 'Retail Store Supervisor',
      relationship_to_respondent: 'Current co-resident / Partner',
      respondent_surname: 'Dlamini',
      respondent_full_names: 'Sipho Mandla',
      respondent_id_or_dob: '880922 5142 081',
      respondent_phone: '082 555 0194',
      respondent_email: 's.dlamini@example.co.za',
      respondent_address: '14 Vilakazi Street, Orlando West, Soweto',
      respondent_work_address: '38 Main Reef Road, Industria, Johannesburg',
      respondent_occupation: 'Logistics Driver',
      police_station: 'Orlando SAPS',
      magistrates_court: 'Protea Magistrates Court (Soweto)',
    };
    setFields(sample);
    setSurvivorName(`${sample.applicant_full_names} ${sample.applicant_surname}`);
    setRespondentName(`${sample.respondent_full_names} ${sample.respondent_surname}`);
    handleNotesChange(
      'On 24 October 2026 at 21:40 at 14 Vilakazi Street, Soweto, the Respondent arrived home intoxicated, locked the front door, took my phone and bank card, and struck me across the face causing bruising on my left cheek. He threatened to kill me if I reported him to SAPS.'
    );
    setErrorMsg('');
  };

  const handleStructureWithAI = async () => {
    setLoadingStructure(true);
    setHumanConfirmed(false);
    setErrorMsg('');
    const appFull =
      `${fields.applicant_full_names} ${fields.applicant_surname}`.trim() || survivorName;
    const respFull =
      `${fields.respondent_full_names} ${fields.respondent_surname}`.trim() || respondentName;
    try {
      const hashes = evidenceItems.map((item) => item.sha256).filter(Boolean);
      const response = await fetch('/api/v1/legal/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          survivor_name: appFull,
          respondent_name: respFull,
          raw_notes: rawNotes,
          evidence_hashes: hashes,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStructuredData(data);
    } catch {
      setStructuredData({
        ...fields,
        applicant_full_name: appFull,
        respondent_full_name: respFull,
        incident_date_time: '',
        incident_location: fields.applicant_address || '',
        nature_of_domestic_violence: ['Physical Abuse', 'Intimidation'],
        chronological_affidavit_narrative: rawNotes,
        weapons_or_threats_involved: '',
        urgency_grounds_section_4: '',
        requested_protection_terms: [
          'Prohibit Respondent from committing any act of domestic violence',
        ],
        evidence_sha256_manifest: evidenceItems.map((e) => e.sha256).filter(Boolean),
      });
      setErrorMsg('Server unreachable. Showing your own notes unedited; nothing was added.');
    } finally {
      setLoadingStructure(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!structuredData || !humanConfirmed) return;
    setDownloadingPdf(true);
    setErrorMsg('');
    try {
      const payload = {
        ...structuredData,
        ...fields,
        applicant_full_name:
          `${fields.applicant_full_names} ${fields.applicant_surname}`.trim() ||
          structuredData.applicant_full_name,
        respondent_full_name:
          `${fields.respondent_full_names} ${fields.respondent_surname}`.trim() ||
          structuredData.respondent_full_name,
      };
      const response = await fetch('/api/v1/legal/generate-form06', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const inputCls =
    'w-full px-2.5 py-2 rounded-lg bg-[#0e0e0d] border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-neutral-500';
  const labelCls = 'block text-[9px] font-mono uppercase text-neutral-400 mb-1';

  return (
    <div className="space-y-3.5">
      <div className="border-b border-neutral-800 pb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-200">
            DoJ Form 06 (J480) — Court Affidavit
          </h2>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Complete Section 1, 3, 4 & Form 6A fields below
          </p>
        </div>
        <button
          type="button"
          onClick={handleLoadSampleCase}
          className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 font-mono text-[10px] text-amber-400 shrink-0 transition"
        >
          Load Sample
        </button>
      </div>

      {/* SECTION 1 & FORM 6A: COMPLAINANT / APPLICANT PARTICULARS */}
      <div className="p-3 rounded-xl bg-[#161615] border border-neutral-800 space-y-2.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
          Section 1 & Form 6A — Complainant (Applicant)
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Surname</label>
            <input
              type="text"
              placeholder="e.g. Khumalo"
              value={fields.applicant_surname}
              onChange={(e) => updateField('applicant_surname', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Full Names</label>
            <input
              type="text"
              placeholder="e.g. Nomsa Thandiwe"
              value={fields.applicant_full_names}
              onChange={(e) => updateField('applicant_full_names', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>ID. No / Date of Birth</label>
            <input
              type="text"
              placeholder="ID or DOB"
              value={fields.applicant_id_or_dob}
              onChange={(e) => updateField('applicant_id_or_dob', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Cell Phone Number</label>
            <input
              type="tel"
              placeholder="e.g. 073 722 0854"
              value={fields.applicant_phone}
              onChange={(e) => updateField('applicant_phone', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Gender</label>
            <input
              type="text"
              placeholder="e.g. Female"
              value={fields.applicant_gender}
              onChange={(e) => updateField('applicant_gender', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Marital Status</label>
            <input
              type="text"
              placeholder="e.g. Co-habiting / Married"
              value={fields.applicant_marital_status}
              onChange={(e) => updateField('applicant_marital_status', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Email Address</label>
            <input
              type="email"
              placeholder="Optional"
              value={fields.applicant_email}
              onChange={(e) => updateField('applicant_email', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Occupation</label>
            <input
              type="text"
              placeholder="Occupation / Student"
              value={fields.applicant_occupation}
              onChange={(e) => updateField('applicant_occupation', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Home / Temporary Address</label>
          <input
            type="text"
            placeholder="Street address, Suburb, City"
            value={fields.applicant_address}
            onChange={(e) => updateField('applicant_address', e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* SECTION 3: RESPONDENT PARTICULARS */}
      <div className="p-3 rounded-xl bg-[#161615] border border-neutral-800 space-y-2.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
          Section 3 — Respondent Particulars
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Surname (if known)</label>
            <input
              type="text"
              placeholder="e.g. Dlamini"
              value={fields.respondent_surname}
              onChange={(e) => updateField('respondent_surname', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Full Names (if known)</label>
            <input
              type="text"
              placeholder="e.g. Sipho Mandla"
              value={fields.respondent_full_names}
              onChange={(e) => updateField('respondent_full_names', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Relationship of Respondent to Complainant</label>
            <select
              value={fields.relationship_to_respondent}
              onChange={(e) => updateField('relationship_to_respondent', e.target.value)}
              className={inputCls}
            >
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>ID. No / Age (if known)</label>
            <input
              type="text"
              placeholder="ID or estimated age"
              value={fields.respondent_id_or_dob}
              onChange={(e) => updateField('respondent_id_or_dob', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Cell Phone (if known)</label>
            <input
              type="tel"
              placeholder="e.g. 082 555 0194"
              value={fields.respondent_phone}
              onChange={(e) => updateField('respondent_phone', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Email (if known)</label>
            <input
              type="email"
              placeholder="Optional"
              value={fields.respondent_email}
              onChange={(e) => updateField('respondent_email', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Occupation (if known)</label>
            <input
              type="text"
              placeholder="Occupation"
              value={fields.respondent_occupation}
              onChange={(e) => updateField('respondent_occupation', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Home Address (if known)</label>
          <input
            type="text"
            placeholder="Respondent home address"
            value={fields.respondent_address}
            onChange={(e) => updateField('respondent_address', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Work / Study Address (if known)</label>
          <input
            type="text"
            placeholder="Respondent work address"
            value={fields.respondent_work_address}
            onChange={(e) => updateField('respondent_work_address', e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* SECTION 9 & 10: SAPS & COURT VENUE */}
      <div className="p-3 rounded-xl bg-[#161615] border border-neutral-800 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-300">
          Section 9 & 10 — SAPS Station & Court Venue
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>SAPS Police Station (Sec 9)</label>
            <input
              type="text"
              placeholder="e.g. Orlando SAPS"
              value={fields.police_station}
              onChange={(e) => updateField('police_station', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Magistrate&apos;s Court (Sec 10)</label>
            <input
              type="text"
              placeholder="e.g. Protea Magistrates Court"
              value={fields.magistrates_court}
              onChange={(e) => updateField('magistrates_court', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* SECTION 4: VERBATIM INCIDENT NOTES */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-mono uppercase text-neutral-400">
            Section 4 — Verbatim Incident Notes
          </label>
          <span className="text-[10px] font-mono text-neutral-500">{rawNotes.length} chars</span>
        </div>
        <textarea
          rows={4}
          placeholder="Describe when, where, and what happened in your own words..."
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
        {loadingStructure ? 'Structuring Form 06 Fields...' : 'Structure Section 4 Statement'}
      </button>

      {structuredData && (
        <div className="p-3.5 rounded-xl bg-[#181816] border border-neutral-700 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-amber-400">
              AI Structured Court Draft (Editable)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-mono uppercase text-neutral-500 mb-0.5">
                Incident Date / Time
              </label>
              <input
                type="text"
                value={structuredData.incident_date_time || ''}
                onChange={(e) =>
                  setStructuredData({
                    ...structuredData,
                    incident_date_time: e.target.value,
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0e0e0d] border border-neutral-700 text-[11px] text-neutral-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[9px] font-mono uppercase text-neutral-500 mb-0.5">
                Place Where It Happened
              </label>
              <input
                type="text"
                value={structuredData.incident_location || ''}
                onChange={(e) =>
                  setStructuredData({
                    ...structuredData,
                    incident_location: e.target.value,
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0e0e0d] border border-neutral-700 text-[11px] text-neutral-200 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-mono uppercase text-neutral-500 mb-0.5">
              Section 4 Affidavit Narrative
            </label>
            <textarea
              rows={4}
              value={structuredData.chronological_affidavit_narrative}
              onChange={(e) =>
                setStructuredData({
                  ...structuredData,
                  chronological_affidavit_narrative: e.target.value,
                })
              }
              className="w-full p-2.5 rounded-lg bg-[#0e0e0d] border border-neutral-700 text-xs text-neutral-100 leading-relaxed focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[9px] font-mono uppercase text-neutral-500 mb-0.5">
              Injuries / Weapons / Threats (Sec 4 & 5)
            </label>
            <input
              type="text"
              value={structuredData.weapons_or_threats_involved || ''}
              onChange={(e) =>
                setStructuredData({
                  ...structuredData,
                  weapons_or_threats_involved: e.target.value,
                })
              }
              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0e0e0d] border border-neutral-700 text-[11px] text-neutral-200 focus:outline-none"
            />
          </div>

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
