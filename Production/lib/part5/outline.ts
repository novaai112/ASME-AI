/**
 * Structured map of ASME BPVC VIII-2 (2025) Part 5. Written in our own words from the owner's PDF — it holds
 * NO copied Code text. The word-for-word text is read at runtime from the owner's own PDF on the laptop
 * service (see /api/part5/text), so the licensed document never ends up in this repository.
 */
export interface Part5Equation { no: string; latex: string; meaning: string }
export interface Part5Section {
  id: string
  title: string
  page: number // printed page number in the 2025 edition
  group: "general" | "collapse" | "local" | "buckling" | "cyclic" | "creep" | "supplemental" | "reference" | "rule" | "test"
  summary: string
  points: string[]
  equations: Part5Equation[]
  calculators: string[]
  keywords: string[] // regex sources, matched case-insensitively
}

export const GROUP_LABELS: Record<Part5Section["group"], string> = {
  general: "General",
  collapse: "Plastic collapse",
  local: "Local failure",
  buckling: "Buckling",
  cyclic: "Cyclic loading",
  creep: "Creep",
  supplemental: "Supplemental",
  reference: "Reference",
  rule: "Part 4 — design by rule",
  test: "Part 8 — pressure testing",
}

export const PART5_SECTIONS: Part5Section[] = [
  {
    id: "5.1", title: "General requirements", page: 588, group: "general",
    summary: "Part 5 is the design-by-analysis route: the component is qualified from the results of a detailed stress analysis against each applicable failure mode. If several procedures exist for one failure mode, satisfying one of them is enough.",
    points: [
      "Failure modes to evaluate: plastic collapse (5.2), local failure (5.3), buckling (5.4, compressive stress fields only), cyclic loading (5.5, cyclic loads) and creep (5.6, only when the allowable stress is time-dependent).",
      "Local failure need not be checked when the component already complies with Part 4 design rules.",
      "Cyclic rules may also qualify Part 4 components for cyclic service.",
      "The analysis must document assumptions, loads, boundary conditions, supporting calculations and validation; material data come from Part 3 (physical, strength, monotonic and cyclic stress–strain).",
      "Load cases and load-time history are defined in the User’s Design Specification; combinations are in Tables 5.3 (elastic), 5.4 (limit load), 5.5 (elastic–plastic), 5.15 (buckling) and 5.16 (creep). Always evaluate the case with pressure equal to zero.",
      "Wind, seismic and snow factors in the tables are based on ASCE/SEI 7 unless the specification cites another standard.",
    ],
    equations: [], calculators: [],
    keywords: ["part\\s*5\\b", "design[- ]by[- ]analysis", "\\bDBA\\b", "5\\.1(\\.\\d)*\\b", "load case", "load combination", "failure modes?"],
  },
  {
    id: "5.2.1", title: "Plastic collapse — overview", page: 589, group: "collapse",
    summary: "Three alternative methods protect against plastic collapse: elastic stress analysis with stress classification (5.2.2), limit-load analysis (5.2.3) and elastic–plastic analysis (5.2.4).",
    points: [
      "Stress categorisation needs judgement for complex geometry or loading; limit-load or elastic–plastic methods are recommended when categorisation is ambiguous.",
      "Elastic analysis with stress classification can be non-conservative for heavy-wall components (R/t ≤ 4), particularly at discontinuities, and is not recommended there; if peak stresses exceed yield through more than 5% of the wall, use 5.2.3 or 5.2.4.",
      "Strain-controlled loads (prescribed displacements, thermal fields) are not captured by 5.2.2/5.2.3; physically meaningful strains need 5.2.4. Components that lose stiffness with deformation (e.g. a pipe elbow in in-plane bending) must be assessed with 5.2.4 and buckling (5.4).",
      "The primary-stress limits in 5.2.2 are deliberately conservative; they need not be met if 5.2.3 or 5.2.4 is satisfied.",
    ],
    equations: [], calculators: [],
    keywords: ["plastic collapse", "5\\.2(\\.1)?\\b", "heavy[- ]wall", "which method"],
  },
  {
    id: "5.2.2", title: "Elastic stress analysis method", page: 590, group: "collapse",
    summary: "Stresses from an elastic analysis are classified (Pm, PL, Pb, Q, F), converted to von Mises equivalent stresses and compared with S or S_PL (Table 5.3 load combinations).",
    points: [
      "Equivalent stress uses the maximum distortion-energy (von Mises) criterion, eq. (5.1).",
      "Pm: general primary membrane equivalent stress (average across the section; excludes secondary and peak). PL: local primary membrane (a region is local if the equivalent stress above 1.1S does not extend meridionally beyond the limit given in 5.2.2.2(b); such regions must be separated by the stated distance). Pb: primary bending. Q and F are not needed for plastic collapse but are needed for fatigue and ratcheting.",
      "Procedure: (1) identify loads (Table 5.1) and combinations (Table 5.3); (2) get the six stress components for each load and assign to categories using Figure 5.1 and Table 5.6; (3) add tensors within each category; (4) find principal stresses and the equivalent stress, eq. (5.1); (5) find S_PL, eq. (5.2); (6) check eq. (5.3)–(5.5).",
      "Stress results are linearised across the section per Annex 5-A.",
      "Load-controlled-only cases give Pm, PL+Pb or PL+Pb+Q directly; strain-controlled-only cases give Q; PL+Pb+Q needs both.",
      "Additional limits 5.2.2.5: bearing ≤ Sy (1.5Sy with enough edge distance); average primary shear ≤ 0.4Sy (0.5Sy for primary + secondary); torsion shear ≤ 0.57Sy.",
      "Test condition 5.2.2.6: not needed when the test pressure equals the minimum from 8.2.1; for a higher selected test pressure, evaluate Design Load Combination (17) of Table 5.3 with the limits of 4.1.6.2, and satisfy 5.4.",
    ],
    equations: [
      { no: "5.1", latex: "\\sigma_e=\\frac{1}{\\sqrt2}\\left[(\\sigma_1-\\sigma_2)^2+(\\sigma_2-\\sigma_3)^2+(\\sigma_3-\\sigma_1)^2\\right]^{0.5}", meaning: "von Mises equivalent stress" },
      { no: "5.2", latex: "S_{PL}=\\begin{cases}\\max(1.5S,S_y)&SMYS/UTS\\le0.7\\\\1.5S&SMYS/UTS>0.7\\end{cases}", meaning: "Allowable for local primary stresses" },
      { no: "5.3", latex: "P_m\\le S", meaning: "General primary membrane limit" },
      { no: "5.4", latex: "P_L\\le S_{PL}", meaning: "Local primary membrane limit" },
      { no: "5.5", latex: "(P_L+P_b)\\le S_{PL}", meaning: "Membrane plus bending limit" },
    ],
    calculators: ["von-mises", "plastic-collapse-elastic", "bearing-shear"],
    keywords: ["elastic stress analysis", "stress classification", "stress categor", "linearis|linearization", "\\bP_?m\\b", "\\bP_?L\\b", "\\bS_?PL\\b", "von mises", "equivalent stress", "primary membrane", "primary bending", "5\\.2\\.2(\\.\\d)*\\b", "bearing stress", "shear stress limit", "1\\.1S"],
  },
  {
    id: "5.2.3", title: "Limit-load analysis method", page: 593, group: "collapse",
    summary: "A numerical limit-load analysis with an elastic–perfectly plastic material (yield taken as 1.5S) and small-displacement theory; factored loads (Table 5.4) must be carried without loss of equilibrium.",
    points: [
      "Gives a lower bound to the collapse load; displacements and strains from the solution have no physical meaning (use 5.2.4 when such limits are specified).",
      "Von Mises yield function with associated flow rule; plastic limit yield strength equals 1.5S.",
      "Global criterion: the analysis must converge under the factored load combinations of Table 5.4 (LRFD-type design factors). Service criteria from the User’s Design Specification must also be met using 5.2.4 procedures.",
      "Every load combination is analysed, including cases where one or more loads are absent.",
    ],
    equations: [], calculators: [],
    keywords: ["limit[- ]load", "5\\.2\\.3(\\.\\d)*\\b", "elastic[- ]perfectly plastic", "table 5\\.4\\b", "1\\.5S"],
  },
  {
    id: "5.2.4", title: "Elastic–plastic stress analysis method", page: 594, group: "collapse",
    summary: "Collapse is evaluated with a nonlinear elastic–plastic analysis (including nonlinear geometry) under the factored load combinations of Table 5.5; the model reflects real redistribution and deformation.",
    points: [
      "Von Mises yield and associated flow rule; hardening, softening or elastic–perfectly plastic models are allowed. Annex 3-D gives a true stress–strain model; hardening applies up to true ultimate stress, then perfect plasticity.",
      "Global criterion via Table 5.5 factored loads (β factors); convergence means the component is stable for that load case. If not, change the configuration or reduce the loads.",
      "Service criteria (flange rotation, deflection limits, interference with adjacent equipment) are checked at design loads; geometric stiffening (elliptical or torispherical heads under pressure) can hide excessive deformation.",
      "A compressive stress field may need a buckling evaluation per 5.4.",
      "Test condition 5.2.4.5: not needed at the minimum test pressure; otherwise use the Table 5.5 test combination with β_T from Table 4.1.3, and satisfy 5.4.",
    ],
    equations: [], calculators: [],
    keywords: ["elastic[- ]plastic (stress )?analysis", "5\\.2\\.4(\\.\\d)*\\b", "table 5\\.5\\b", "plastic collapse load", "service criteria"],
  },
  {
    id: "5.3", title: "Protection against local failure", page: 595, group: "local",
    summary: "Local failure (ductile rupture at a triaxially stressed location) is checked either by the elastic triaxial stress limit (5.3.2) or by the elastic–plastic local strain limit (5.3.3).",
    points: [
      "Applies to components whose thickness and configuration are set by design-by-analysis; not needed if the design follows Part 4.",
      "5.3.2: the sum of the three linearised primary principal stresses from Design Load Combination (1) of Table 5.3 must not exceed 4S, eq. (5.6).",
      "5.3.3.1: at each point find σ1–σ3, σe (5.1) and the equivalent plastic strain; compute the limiting triaxial strain ε_L (5.7) using ε_Lu, m2 and α_sl from Table 5.7; add the forming strain ε_cf (zero if heat-treated per Part 6) and require eq. (5.8).",
      "5.3.3.2: for a specified load sequence, divide the history into increments, compute ε_L,k (5.9), damage per increment (5.10) and forming damage (5.11); total damage (5.12) must not exceed 1.0.",
    ],
    equations: [
      { no: "5.6", latex: "(\\sigma_1+\\sigma_2+\\sigma_3)\\le4S", meaning: "Triaxial stress limit" },
      { no: "5.7", latex: "\\varepsilon_L=\\varepsilon_{Lu}\\exp\\left\\{-\\frac{\\alpha_{sl}}{1+m_2}\\left[\\frac{\\sigma_1+\\sigma_2+\\sigma_3}{3\\sigma_e}-\\frac13\\right]\\right\\}", meaning: "Limiting triaxial strain" },
      { no: "5.8", latex: "\\varepsilon_{peq}+\\varepsilon_{cf}\\le\\varepsilon_L", meaning: "Strain limit check" },
      { no: "5.9", latex: "\\varepsilon_{L,k}=\\varepsilon_{Lu}\\exp\\left\\{-\\frac{\\alpha_{sl}}{1+m_2}\\left[\\frac{\\sigma_{1,k}+\\sigma_{2,k}+\\sigma_{3,k}}{3\\sigma_{e,k}}-\\frac13\\right]\\right\\}", meaning: "Limiting strain at increment k" },
      { no: "5.10", latex: "D_{\\varepsilon,k}=\\frac{\\Delta\\varepsilon_{peq,k}}{\\varepsilon_{L,k}}", meaning: "Increment damage" },
      { no: "5.11", latex: "D_{\\varepsilon form}=\\frac{\\varepsilon_{cf}}{\\varepsilon_{Lu}\\exp\\left[-\\frac13\\left(\\frac{\\alpha_{sl}}{1+m_2}\\right)\\right]}", meaning: "Forming damage" },
      { no: "5.12", latex: "D_\\varepsilon=D_{\\varepsilon form}+\\sum_{k=1}^{M}D_{\\varepsilon,k}\\le1.0", meaning: "Accumulated strain-limit damage" },
    ],
    calculators: ["triaxial", "strain-limit", "strain-damage"],
    keywords: ["local failure", "triaxial", "strain limit", "\\bε_?L\\b", "5\\.3(\\.\\d)*\\b", "table 5\\.7\\b", "forming strain", "strain[- ]limit damage", "ductile rupture"],
  },
  {
    id: "5.4", title: "Protection against collapse from buckling", page: 596, group: "buckling",
    summary: "Components with compressive stress fields get a design factor against buckling: Method A (elastic eigenvalue procedure with capacity reduction factors) or Method B (elastic–plastic buckling analysis with imperfections).",
    points: [
      "Method A, five steps per load combination of Table 5.15: eigenvalue analysis with β_b = 1.0; elastic stress analysis with loads multiplied by the eigenvalue; extract the equivalent membrane stress at the critical buckling location; multiply by the capacity reduction factor β_cr; compare with 0.55Sy; divide by the design margin 2.0 to get S_c,k; finally check P_m,k ≤ S_c,k with β_b = 1.0 (eq. 5.13).",
      "If σ_crit exceeds 0.55Sy, S_c,k = 0.55Sy/2, or use Method B.",
      "Capacity reduction: axial stress in cylinder/cone β_cr = 0.207 for Do/t ≥ 1247, otherwise 338/(389 + Do/t); hoop stress in cylinder/cone 0.80; sphere or formed head 0.124. If the critical location is not covered by these cases Method B applies.",
      "Method B has no applicability limits: eigenvalue analysis, geometric imperfections from the first eigenmode (magnitudes from 4.4.4, fabrication tolerances or measurement), then elastic–plastic analysis with β_b = 1.67 including imperfections and nonlinear geometry (von Mises, hardening to true ultimate stress).",
      "Fabrication tolerances must satisfy 4.4.4. Buckling must also be satisfied for the test condition at the selected test pressure.",
    ],
    equations: [
      { no: "5.13", latex: "P_{m,k}\\le S_{c,k}", meaning: "Method A acceptance" },
      { no: "5.14", latex: "\\beta_{cr}=0.207\\;\\;(D_o/t\\ge1247)", meaning: "Axial stress, cylinder/cone" },
      { no: "5.15", latex: "\\beta_{cr}=\\frac{338}{389+D_o/t}\\;\\;(D_o/t<1247)", meaning: "Axial stress, cylinder/cone" },
      { no: "5.16", latex: "\\beta_{cr}=0.80", meaning: "Hoop stress, cylinder/cone" },
      { no: "5.17", latex: "\\beta_{cr}=0.124", meaning: "Sphere or formed head" },
    ],
    calculators: ["buckling-a"],
    keywords: ["buckling", "5\\.4(\\.\\d)*\\b", "eigen", "capacity reduction", "\\bβ_?cr\\b", "table 5\\.15\\b", "S_?c,?k", "compressive stress"],
  },
  {
    id: "5.5.1", title: "Cyclic loading — overview and requirements", page: 598, group: "cyclic",
    summary: "Ratcheting and fatigue are always considered separately. Ratcheting protection is mandatory (even if fatigue screening passes); fatigue evaluation is needed for cyclic operation unless exempt or screened out.",
    points: [
      "Screening (5.5.1.2): Method A (limited to certain steel), Method B (smooth-bar curve, unlimited) or Method C (welded-joint curve, unlimited); if none is met, do a fatigue analysis.",
      "Fatigue analysis methods (5.5.1.3): A — elastic stress, equivalent stress amplitude, smooth-bar curve (5.5.4.2); B — elastic–plastic strain, smooth-bar curve (5.5.4.3); C — equivalent structural stress, welded-joint curve (5.5.4.4).",
      "Smooth-bar curves (Annex 3-F.1) apply to welded or unwelded parts but need weld fatigue strength reduction factors; welded-joint curves (Annex 3-F.2) apply only to welded joints and have no endurance limit.",
      "Mean stress: Methods A and B curves already allow for it; Method C builds it into the structural stress formulation.",
      "Ratcheting is satisfied by (a) primary stresses only, (b) the elastic rules of 5.5.5.2 (Method A or B Bree), or (c) elastic–plastic analysis 5.5.5.3.",
      "Joint alignment and weld peaking must be considered when screening or analysing fatigue.",
    ],
    equations: [], calculators: [],
    keywords: ["cyclic loading", "5\\.5(\\.1)?\\b", "fatigue", "ratchet", "mean stress", "smooth[- ]bar", "welded joint curve", "which fatigue method"],
  },
  {
    id: "5.5.2", title: "Exemption from fatigue screening and analysis", page: 599, group: "cyclic",
    summary: "A fatigue analysis is not required when successful experience with comparable equipment and a similar load history is documented in the User’s Design Specification.",
    points: [
      "The same alignment and peaking tolerances and weld quality levels (Tables 5.12 and 5.13) must be used as on the comparable equipment.",
      "Features whose harmful effects must be weighed: nonintegral construction (pad reinforcements, fillet-welded attachments), pipe-threaded connections (especially over 70 mm / 2.75 in.), stud-bolted attachments, partial-penetration welds, major thickness changes, attachments and nozzles in the knuckle region of formed heads.",
      "Surface examination after pressure test must match the comparable equipment (7.6.1).",
    ],
    equations: [], calculators: [],
    keywords: ["fatigue exempt", "exemption", "5\\.5\\.2\\b", "comparable equipment", "successful experience"],
  },
  {
    id: "5.5.3", title: "Fatigue screening criteria (Methods A, B, C)", page: 599, group: "cyclic",
    summary: "Count the significant cycles and compare with Table 5.9 (Method A) or accumulate screening damage with a smooth-bar (B) or welded-joint (C) curve; D_f ≤ 1.0 means no detailed fatigue analysis.",
    points: [
      "Method A is only for steel with specified minimum tensile strength ≤ 552 MPa (80 ksi) and only for cyclic pressure and temperature loads. Cycles counted: N_ΔFP, N_ΔPO, N_ΔTE (temperature differences weighted by Table 5.8) and N_ΔTα; the sum must meet Table 5.9 (350 or 1000 integral, 60 or 400 nonintegral — knuckle attachments/nozzles versus other components).",
      "Adjacent points for surface temperature differences lie within L_fs = 2.5√(Rt) (shells, heads) or 3.5R_HS (flat plates); through-thickness points lie on a normal to the surface.",
      "If the number of cycles, excluding non-significant pressure cycles, exceeds 10⁶ the screening criteria do not apply.",
      "Method B (smooth-bar curve): K_fb (Table 5.10, max 3.0) and H_c; damages D_FP, D_PN, D_TN, D_TR, D_TM, D_ML from eq. (5.20)–(5.25); D_f ≤ 1.0 (5.26).",
      "Method C (welded-joint curve): same structure using the equivalent structural stress range ΔS_ess from eq. (5.27)/(5.28) and eq. (5.29)–(5.34); D_f ≤ 1.0 (5.35).",
      "Surface examination after pressure test is required where K_fb relies on it (Quality Levels 1–3, Table 5.13) or where the User’s Design Specification asks for it.",
    ],
    equations: [
      { no: "5.18", latex: "L_{fs}=2.5\\sqrt{Rt}", meaning: "Adjacent-point distance, shells and dished heads" },
      { no: "5.19", latex: "L_{fs}=3.5R_{HS}", meaning: "Adjacent-point distance, flat plates" },
      { no: "5.20", latex: "D_{FP}=\\frac{N_{\\Delta FP}}{N\\left(\\frac{K_{fb}H_c(3S)}{2}\\right)}", meaning: "Full-range pressure damage" },
      { no: "5.21", latex: "D_{PN}=\\frac{N_{\\Delta P}}{N\\left(\\frac{\\Delta P_NK_{fb}H_c(3S)}{2P}\\right)}", meaning: "Pressure-fluctuation damage" },
      { no: "5.22", latex: "D_{TN}=\\frac{N_{\\Delta TN}}{N\\left(\\frac{K_{fb}H_c(2E_{ym}\\alpha_b\\Delta T_N)}{2}\\right)}", meaning: "Start-up/shutdown temperature damage" },
      { no: "5.23", latex: "D_{TR}=\\frac{N_{\\Delta TR}}{N\\left(\\frac{K_{fb}H_c(2E_{ym}\\alpha_b\\Delta T_R)}{2}\\right)}", meaning: "Normal-operation temperature damage" },
      { no: "5.24", latex: "D_{TM}=\\frac{N_{\\Delta TM}}{N\\left(\\frac{K_{fb}H_c(2E_{y1}\\alpha_1\\Delta T_M-2E_{y2}\\alpha_2\\Delta T_M)}{2}\\right)}", meaning: "Dissimilar-material damage" },
      { no: "5.25", latex: "D_{ML}=\\frac{N_{\\Delta S}}{N\\left(\\frac{K_{fb}H_c\\Delta S_{ML}}{2}\\right)}", meaning: "Mechanical-load damage" },
      { no: "5.26", latex: "D_f=D_{FP}+D_{PN}+D_{TN}+D_{TR}+D_{TM}+D_{ML}\\le1.0", meaning: "Method B screening acceptance" },
    ],
    calculators: ["screening-a", "adjacent-distance", "screening-b"],
    keywords: ["fatigue screening", "5\\.5\\.3(\\.\\d)*\\b", "table 5\\.9\\b", "table 5\\.8\\b", "table 5\\.10\\b", "\\bK_?fb\\b", "\\bL_?fs\\b", "screening method", "temperature factor"],
  },
  {
    id: "5.5.4", title: "Fatigue analysis", page: 603, group: "cyclic",
    summary: "Method A evaluates the effective alternating equivalent stress from a linear elastic analysis with a fatigue penalty factor K_e, reads the permissible cycles from the Annex 3-F.1 smooth-bar curve and sums the damage; Methods B and C use strain and structural stress.",
    points: [
      "Controlling stress is half of the primary + secondary + peak equivalent stress range Δ(PL+Pb+Q+F) for each counted cycle (cycle counting per Annex 5-B).",
      "Option 1 applies K_e to the whole range (eq. 5.41); Option 2 separates the local thermal stress, applies K_e to the remainder and the Poisson factor K_v to the local thermal part (eq. 5.42).",
      "K_e (eq. 5.43–5.45) uses m and n from Table 5.14 and S_PS,k; it applies only if the component does not ratchet and the temperature is within the Table 5.14 limit. If K_e > 1.0 the material must satisfy SMYS/UTS ≤ 0.80, otherwise Method A cannot be used.",
      "Permissible cycles N_k come from the Annex 3-F.1 curve at S_alt; damage D_f,k = n_k/N_k (5.48) and D_f = ΣD_f,k ≤ 1.0 (5.49) at every point evaluated.",
      "Weld fatigue strength reduction factors are in Tables 5.12 and 5.13; K_f × SCF may be limited to 5.0 unless test data justify more (Table 5.11).",
      "Alternative methods: local thermal stress from the through-thickness temperature profile (5.50–5.54) and K_e from elastic–plastic versus elastic results (5.55).",
    ],
    equations: [
      { no: "5.41", latex: "S_{alt,k}=\\frac{K_{e,k}\\Delta S_{P,k}}{2}", meaning: "Option 1 amplitude" },
      { no: "5.42", latex: "S_{alt,k}=\\frac{K_{e,k}\\Delta S_{P-LT,k}+K_{v,k}\\Delta S_{LT,k}}{2}", meaning: "Option 2 amplitude" },
      { no: "5.43", latex: "K_{e,k}=1.0\\;\\;\\text{for }\\Delta S_{n,k}\\le S_{PS,k}", meaning: "No penalty" },
      { no: "5.44", latex: "K_{e,k}=1+\\frac{1-n}{n(m-1)}\\left(\\frac{\\Delta S_{n,k}}{S_{PS,k}}-1\\right)\\;\\;\\text{for }S_{PS,k}<\\Delta S_{n,k}\\le mS_{PS,k}", meaning: "Intermediate range" },
      { no: "5.45", latex: "K_{e,k}=\\frac1n\\;\\;\\text{for }\\Delta S_{n,k}>mS_{PS,k}", meaning: "Upper limit of penalty" },
      { no: "5.46", latex: "K_{v,k}=\\frac{1-\\nu}{1-\\nu_p}", meaning: "Poisson correction" },
      { no: "5.47", latex: "\\nu_p=\\max\\left[0.5-0.2\\frac{S_{y,k}}{S_{a,k}},\\nu\\right]", meaning: "Plastic Poisson ratio" },
      { no: "5.48", latex: "D_{f,k}=\\frac{n_k}{N_k}", meaning: "Damage for cycle k" },
      { no: "5.49", latex: "D_f=\\sum_{k=1}^{M}D_{f,k}\\le1.0", meaning: "Accumulated damage" },
    ],
    calculators: ["fatigue-elastic"],
    keywords: ["fatigue analysis", "5\\.5\\.4(\\.\\d)*\\b", "fatigue penalty", "\\bK_?e\\b", "alternating stress", "\\bS_?alt\\b", "table 5\\.14\\b", "table 5\\.12\\b", "table 5\\.13\\b", "damage", "cycle counting", "poisson"],
  },
  {
    id: "5.5.5", title: "Ratcheting assessment", page: 612, group: "cyclic",
    summary: "Ratcheting (progressive deformation under steady primary plus cyclic secondary loading) is checked with an elastic analysis — Method A (stress range limit) or Method B (Bree diagram) — or with elastic–plastic analysis.",
    points: [
      "Method A: the primary + secondary equivalent stress range ΔS_n,k must not exceed S_PS,k = Sy-cold,k + Sy-hot,k (eq. 5.95, 5.96), with yield strength derated if the material cyclically softens.",
      "If ΔS_n,k exceeds S_PS,k, the simplified elastic–plastic procedure (5.5.5.2.1.2) may be used for a vessel with the same design and operating conditions as a previously analysed one, provided Δ(PL+Pb+Qm) ≤ S_PS,k (5.97), a fatigue analysis with K_e is done, SMYS/UTS ≤ 0.80, and the thermal-stress ratcheting limits (5.98–5.105) are met (linear or parabolic secondary stress only).",
      "Method B (5.5.5.2.2) uses the Bree diagram for four loading types with linear primary and secondary stress.",
      "5.5.5.3: elastic–plastic ratcheting analysis applies, removes and re-applies the loads to confirm no progressive incremental deformation.",
    ],
    equations: [
      { no: "5.95", latex: "S_{PS,k}=S_{y\\text{-}cold,k}+S_{y\\text{-}hot,k}", meaning: "Allowable stress range" },
      { no: "5.96", latex: "\\Delta S_{n,k}\\le S_{PS,k}", meaning: "Method A acceptance" },
      { no: "5.97", latex: "\\Delta(P_L+P_b+Q_m)\\le S_{PS,k}", meaning: "Simplified procedure prerequisite" },
      { no: "5.98", latex: "X_s=\\frac{P_m}{S_{y\\text{-}avg}}", meaning: "Primary membrane ratio" },
      { no: "5.99", latex: "S_{Qmb}=S_{y\\text{-}avg}\\frac1{X_s}\\;\\;(0<X_s<0.5,\\text{ linear})", meaning: "Allowable, linear thermal" },
      { no: "5.100", latex: "S_{Qmb}=4.0S_{y\\text{-}avg}(1-X_s)\\;\\;(0.5\\le X_s\\le1.0)", meaning: "Allowable, linear thermal" },
      { no: "5.101", latex: "S_{Qmb}=\\frac{S_{y\\text{-}avg}}{0.1224+0.9944X_s^2}\\;\\;(0\\le X_s<0.615,\\text{ parabolic})", meaning: "Allowable, parabolic thermal" },
      { no: "5.102", latex: "S_{Qmb}=5.2S_{y\\text{-}avg}(1-X_s)\\;\\;(0.615\\le X_s\\le1.0)", meaning: "Allowable, parabolic thermal" },
      { no: "5.103", latex: "S_{Qm}=2.0S_{y\\text{-}avg}(1-X_s)", meaning: "Allowable secondary membrane" },
      { no: "5.104", latex: "\\Delta Q_m\\le S_{Qm}", meaning: "Criterion" },
      { no: "5.105", latex: "\\Delta Q_{mb}\\le S_{Qmb}", meaning: "Criterion" },
    ],
    calculators: ["ratcheting-a", "ratcheting-thermal"],
    keywords: ["ratchet", "5\\.5\\.5(\\.\\d)*\\b", "bree", "shakedown", "\\bS_?PS\\b", "thermal stress ratchet", "5\\.9[5-9]\\b|5\\.10[0-5]\\b"],
  },
  {
    id: "5.6", title: "Protection against creep damage", page: 615, group: "creep",
    summary: "Applies when the Annex 3-A allowable stress is governed by time-dependent properties: stress rupture, creep buckling, creep-fatigue and creep ratcheting.",
    points: [
      "Stress rupture under load-controlled loading: design by rule (Part 4) or the elastic stress analysis procedure with the time-dependent allowable S (thermal-gradient loads do not contribute) and Table 5.16 combinations. Occasional-loading elastic method (5.6.2.2) is in development.",
      "Creep buckling: use 5.4 Method B with isochronous stress–strain curves for 100 000 h and minimum properties.",
      "Creep-fatigue: avoid the interaction. Exempt by comparable experience or by cycle screening — N_ΔFP ≤ 250 (5.113) and N_ΔFP + N_ΔP + N_ΔTR ≤ 500 (5.114); only cycles with an end in the creep regime count and significant temperature cycles exceed 25% of design temperature.",
      "Creep ratcheting: as 5.5.5.2.1 but with S_PS = Sy-cold,k + S (5.115). Elastic–visco-plastic method is in development. Service criteria are a User/Owner matter.",
    ],
    equations: [
      { no: "5.113", latex: "N_{\\Delta FP}\\le250", meaning: "Creep-fatigue screening, step 2" },
      { no: "5.114", latex: "N_{\\Delta FP}+N_{\\Delta P}+N_{\\Delta TR}\\le500", meaning: "Creep-fatigue screening, step 5" },
      { no: "5.115", latex: "S_{PS}=S_{y\\text{-}cold,k}+S", meaning: "Creep-ratcheting limit" },
    ],
    calculators: ["creep-fatigue-screen", "creep-ratcheting"],
    keywords: ["creep", "5\\.6(\\.\\d)*\\b", "stress rupture", "creep[- ]fatigue", "table 5\\.16\\b", "time[- ]dependent"],
  },
  {
    id: "5.7", title: "Stress classification in nozzle necks", page: 617, group: "supplemental",
    summary: "Within the Part 4.5 reinforcement limits, pressure membrane stress and non-discontinuity external-load stress are Pm, discontinuity and combined local bending are PL, and the full combination is PL+Pb+Q; outside the limits, further rules apply.",
    points: ["See the full text for the classification outside the reinforcement limits and for the attached-piping treatment."],
    equations: [], calculators: [],
    keywords: ["nozzle neck", "5\\.7\\b", "nozzle.*classif", "classif.*nozzle"],
  },
  {
    id: "5.8", title: "Bolts", page: 618, group: "supplemental",
    summary: "Bolt area follows Part 4.16 with allowable stress from Part 3; service stress may exceed the allowable: average ≤ 2S and periphery (tension plus bending) ≤ 3S; fatigue uses 5.5.4.2 with a strength reduction factor of at least 4.0.",
    points: [
      "Seal-welded joints and gaskets used for pre-service testing only may take m_gasket and y_gasket as zero (with the test gasket checked).",
      "Bolts under 689 MPa (100 ksi) UTS use the 3-F.1.2(a)–(d) curves with K_f ≥ 4.0. High-strength B7/B16/L43/B23/B24 bolting may use the 3-F.1.2(e) curve if the peripheral stress ≤ 2.7S, V-threads with root radius ≥ 0.076 mm, shank fillet ratio ≥ 0.060 and K_f ≥ 4.0.",
      "Acceptance: fatigue damage fraction D_f ≤ 1.0.",
    ],
    equations: [], calculators: ["bolt-service"],
    keywords: ["\\bbolts?\\b", "bolting", "5\\.8(\\.\\d)*\\b", "gasket", "stud"],
  },
  {
    id: "5.9-5.12", title: "Perforated plates, layered vessels, experimental analysis, fracture mechanics", page: 619, group: "supplemental",
    summary: "5.9: perforated plates may be analysed with the Part 5 methods if holes are modelled explicitly, or with the effective-solid-plate option of Annex 5-E. 5.10: layered vessels. 5.11: experimental stress analysis. 5.12: fracture-mechanics evaluations.",
    points: ["See the full text for the requirements of each paragraph."],
    equations: [], calculators: [],
    keywords: ["perforated", "layered", "experimental stress", "fracture mechanic", "5\\.(9|10|11|12)\\b"],
  },
  {
    id: "5.13-5.16", title: "Definitions, nomenclature, tables, figures", page: 619, group: "reference",
    summary: "5.13 definitions, 5.14 nomenclature, 5.15 tables (loads 5.1–5.2; combinations 5.3–5.5, 5.15, 5.16; Table 5.6 stress classification examples; 5.7 strain limits; 5.8–5.10 screening factors; 5.11–5.13 fatigue stress and weld factors; 5.14 fatigue penalty factors), 5.16 figures.",
    points: ["Use the Part 5 Explorer ‘Full text’ view to read any table or figure caption from your PDF."],
    equations: [], calculators: [],
    keywords: ["nomenclature", "definition", "5\\.1[3-6]\\b", "table 5\\.\\d+", "figure 5\\.\\d+"],
  },
]

export const getSection = (id: string) => PART5_SECTIONS.find((s) => s.id === id)
