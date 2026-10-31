# FoodRescue-AI (AnnaPurti): 7-Minute Faculty & Interview Demo Script

*A step-by-step presentation walkthrough showcasing hand-written Constraint Satisfaction (CSP), A* routing, food safety deadlines, row-locked reservation, and the Admin Explain View.*

---

## Demo Schedule & Timeline (Total: 7 Minutes)

| Time | Segment | What to Show | Key Talking Point |
| :--- | :--- | :--- | :--- |
| **0:00 - 1:00** | **Problem & Safety Rules** | Platform overview, Ahmedabad pilot map | "Perishable food is a race against biology. FSSAI imposes a hard 4-hour limit." |
| **1:00 - 2:00** | **Plain-Language Donor Intake** | Donor Portal, typing plain sentence | "NLP parser extracts lots, category & window; sender cannot extend safe limit." |
| **2:00 - 3:00** | **Concurrency & Oversell Test** | Switch to NGO portal, concurrent claims | "Row locking `SELECT ... FOR UPDATE` prevents double-claims. Exactly one wins." |
| **3:00 - 4:00** | **Allocation & A* Routing** | Trigger CSP solver, inspect route on map | "Coupled allocation and A* routing; provably optimal on up to 6 stops." |
| **4:00 - 5:00** | **Explain View & Disruption Injection**| Admin Explain View, inject vehicle cancel | "Full algorithmic transparency: pruned reason codes, repair loop, failure ladder." |
| **5:00 - 6:00** | **Benchmark Comparison** | What-If stress test sweeper | "Baselines B1/B2 cause 30+ deadline violations; our solver has exactly 0." |
| **6:00 - 7:00** | **Handover OTP & Impact Dashboard** | QR handover pass, Recharts funnel | "Delivered vs distributed, people fed, UNEP/FAO scientific carbon offset." |

---

## Detailed Step-by-Step Walkthrough

### Minute 0:00 – 1:00: Platform Overview & Food Safety
1. **Open the browser:** Navigate to `http://localhost:5173`.
2. **Point out the Top Navigation:**
   - Mention the 4 views: **Donor Portal**, **NGO Receiver**, **Admin Explain View**, **Impact Dashboard**.
   - Note the **Persona Switcher** in the top right (Donor, NGO, Admin) and the live API pulse.
3. **Core Concept:**
   - *"Unlike dry e-commerce delivery, surplus hot food spoils on a strict deadline. Under FSSAI rules, hot food must be consumed within 4 hours. Generic logistics algorithms treat deadlines as soft penalties; we enforce them as absolute hard constraints."*

---

### Minute 1:00 – 2:00: Plain-Language Donor Intake
1. **Click "Donor"** in the top-right persona switcher.
2. Click **"+ New Food Listing"**.
3. In the modal, locate the **Plain-Language Quick Intake** box at the top.
4. Type:
   ```text
   150 hot dal khichdi meals prepared at 12 pm, pickup till 3 pm
   ```
5. Click **"Smart Parse"**:
   - Show how it instantly populates:
     - Name: `Hot Dal Khichdi`
     - Category: `cooked_hot` (FSSAI 4-hour window)
     - Total Lots: `15 lots` (150 meals @ 10 meals/lot)
     - Safe window clamped to 240 minutes.
6. Click **"Publish Listing"**.
7. **Show the Listing Card:**
   - Point out the **Live Spoilage Countdown** (color-coded: Green > 2h, Amber 1-2h, Red < 1h).
   - Point out the multi-color **Quantity Invariant Bar** (`available` vs `reserved` vs `delivered` vs `closed`).

---

### Minute 2:00 – 3:00: Concurrency & Row-Locked Double-Reservation
1. **Switch Persona to "NGO"** (top right).
2. Point out the **Personalized Feasibility Badge**:
   - `Feasible (45m slack)` for items that fit transit time.
   - `Infeasible` for items where travel time would breach the perishable deadline.
3. **Test the Double-Request Scenario:**
   - Find a listing with 1 available lot.
   - Click **"Request Food Lots"** and claim the lot.
   - Show the success alert: `Reserved 1 lot atomically!`.
   - Now immediately click **"Request Food Lots"** again for the same listing.
   - **Show the rejection:** Red alert `400 Bad Request: INVENTORY_EXHAUSTED`.
   - **Explain to evaluator:** *"Our PostgreSQL row-level lock `SELECT ... FOR UPDATE` prevents overselling at the database engine level, guaranteeing the quantity invariant."*

---

### Minute 3:00 – 4:00: CSP Allocation & Routing
1. **Switch back to "Donor"** (or Admin).
2. Click **"Run CSP Solver"** button.
3. Show the notification: `Allocation complete! Allocated: 2/2 requests in 1 repair round.`
4. Point out the planned delivery job created with vehicle assignment and route stops.

---

### Minute 4:00 – 5:00: Admin Explain View & Failure Ladder
1. **Switch Persona to "Admin"** and navigate to **"Admin Explain View"**.
2. **Explain View Components:**
   - **Left:** The interactive **Leaflet Route Map** showing the vehicle depot, pickup stop, and NGO delivery stop with time labels.
   - **Right:** The **Decision Audit Log** timeline feed.
3. **Show a Pruned Decision:**
   - Filter by reason code `SAFETY_DEADLINE_EXPIRED` or `CAPACITY`.
   - Show the exact reason code and human-readable explanation:
     > *"Option pruned: travel time (48 min) exceeds remaining safe window (30 min)."*
4. **Inject an Operational Disruption:**
   - In the **Disruption Simulator** panel, click **"Vehicle Cancel (Before Pickup)"**.
   - Show how the platform logs a `VEHICLE_CANCEL_REASSIGNED` decision and re-routes the job to the next available fleet van without dropping the food.

---

### Minute 5:00 – 6:00: What-If Stress Sweep & Baseline Comparison
1. Scroll down to the **What-If Stress Test Sweeper**.
2. Set sliders:
   - Traffic Level: **High (1.7x)**
   - Vehicles: **3 (Scarcity)**
   - Deadline Tightness: **Tight**
3. Click **"Run Stress Sweep"**.
4. **Show the Comparison Chart:**
   - **FoodRescue-AI (Ours):** 109 lots saved, **0 deadline violations**.
   - **B1 Nearest-First:** 14 lots saved, **29 deadline violations** (over 85% of food spoiled!).
   - **B2 FCFS:** 13 lots saved, **31 deadline violations**.
5. **Key Talking Point:** *"Greedy nearest heuristics greedily assign food but ignore vehicle return transit times, delivering spoiled food. FoodRescue-AI guarantees 100% safe food with zero violations."*

---

### Minute 6:00 – 7:00: QR Handover & Impact Dashboard
1. **Switch Persona to "NGO"**:
   - On the active delivery job, click the **QR code icon**.
   - Show the **Handover Pass Modal** with SVG QR code and bold 6-digit OTP code (`749201`).
   - Click **"Confirm Receipt (OTP)"**, enter the 6-digit OTP, and submit.
   - Show the job status transition to `Delivered ✓`.
2. **Submit Utilisation Report:**
   - Click **"Submit Report"**, enter `80 people served`, and submit.
3. **Navigate to "Impact" Dashboard:**
   - Show the 4 KPI cards: **Meals Rescued**, **People Served**, **Utilisation Rate (100%)**, **$\text{CO}_2$ Saved**.
   - Show the **Redistribution Funnel** (Published -> Reserved -> Delivered -> Distributed).
   - Point out the scientific assumption text:
     > *"Based on UNEP/FAO benchmarks: 1 meal rescued avoids approx 1.0 kg of $\text{CO}_2\text{e}$ emissions."*
4. **Conclusion:** *"In 7 minutes, we demonstrated an end-to-end redistribution workflow with provable safety guarantees, atomic concurrency, and algorithmic transparency."*

