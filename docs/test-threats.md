# Test Plan — Threats & Infrastructure

**Module:** Threats (Map + Graph)  
**URL:** `http://<host>/` → Tab "Threats"  
**Last Updated:** 2026-04-21  

---

## 1. Page Load & Initial State

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 1.1 | Page loads | Click "Threats" tab | Threats page renders without errors | ☐ |
| 1.2 | Default mode | Observe mode toggle | "Map" mode selected by default | ☐ |
| 1.3 | Top bar visible | Observe header | Shield icon, "Threats & Infrastructure" title, Map/Graph toggle | ☐ |
| 1.4 | Customer filter | Observe top-right | Customer dropdown with "All Customers" + customer list | ☐ |
| 1.5 | Refresh button | Observe top-right | Refresh icon button visible | ☐ |
| 1.6 | No stats bar | Verify header | No "X attacks X internal X sites" text present | ☐ |
| 1.7 | Data fetching | Check Network tab | Calls: attacks, topology nodes/links, feed, filter options, ticket assets | ☐ |

---

## 2. Map Mode — Map Display

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 2.1 | Map renders | Observe main area | Dark Leaflet map (CartoDB dark tiles) centered on Indonesia | ☐ |
| 2.2 | Map zoom - scroll | Scroll wheel on map | Map zooms in/out smoothly | ☐ |
| 2.3 | Map pan | Click-drag on map | Map pans | ☐ |
| 2.4 | Site markers | Observe map | Blue circle markers for sites with no attacks | ☐ |
| 2.5 | Attacked site markers | Sites with attacks | Amber circle markers, larger radius | ☐ |
| 2.6 | Pulse rings | Sites under attack | Dashed pulse ring around attacked sites | ☐ |
| 2.7 | Marker tooltip | Hover over site marker | Tooltip: site label, customer, asset count, attack count | ☐ |
| 2.8 | FitBounds | Page load with multiple sites | Map auto-zooms to fit all site markers | ☐ |

---

## 3. Map Mode — Site Detail Panel

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 3.1 | Open site detail | Click a site marker | Detail panel opens on right side | ☐ |
| 3.2 | Panel content | Observe panel | Customer name, asset count, lat/lng coordinates, attack count | ☐ |
| 3.3 | Close panel | Click X button | Panel closes | ☐ |
| 3.4 | Switch sites | Click another site marker | Panel updates to new site info | ☐ |

---

## 4. Map Mode — Live Attack Feed

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4.1 | Feed visible | Observe bottom of page | 136px feed panel visible with "LIVE ATTACK FEED" header | ☐ |
| 4.2 | Feed rows | Observe feed content | Each row: timestamp, priority dot, subject, arrow, asset, customer | ☐ |
| 4.3 | No TP/FP events | Scan feed | No rows with "TP" or "FP" validation badge — only unvalidated events | ☐ |
| 4.4 | Event count | Observe header | Event count shown (e.g. "42 events") | ☐ |
| 4.5 | Auto-refresh | Wait 30+ seconds | Feed data refreshes automatically | ☐ |
| 4.6 | Priority colors | Observe priority dots | P1=red, P2=amber, P3=gray, P4=dark gray | ☐ |
| 4.7 | Timestamp format | Check timestamps | HH:MM:SS format (24-hour) | ☐ |

---

## 5. Map Mode — Legend

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 5.1 | Legend visible | Observe bottom-left | Small legend panel | ☐ |
| 5.2 | Legend items | Read legend | Blue dot = "Site", Amber dot = "Under attack" | ☐ |
| 5.3 | Replay count | During replay | Legend shows red dot + "{N} replayed" | ☐ |

---

## 6. Map Mode — Historical Replay

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 6.1 | Replay button | Observe top bar | "Replay" button visible in Map mode only | ☐ |
| 6.2 | Open replay panel | Click "Replay" | Panel appears below top bar with From/To inputs | ☐ |
| 6.3 | Close replay panel | Click "Replay" again | Panel closes | ☐ |
| 6.4 | Set date range | Enter From and To datetime | Inputs accept datetime values | ☐ |
| 6.5 | Asset filter | Type asset hostname in filter | Asset field accepts text | ☐ |
| 6.6 | Load replay data | Click "Load" | Replay data loaded, counter shows "0/{total}" | ☐ |
| 6.7 | Play replay | Click Play button | Events appear one by one on map as colored dots | ☐ |
| 6.8 | Accumulation | Watch replay progress | Dots accumulate on map (don't disappear) | ☐ |
| 6.9 | Counter increments | Observe counter | Shows current/total (e.g. "15/120") | ☐ |
| 6.10 | Stop replay | Click Stop button | Replay pauses at current position | ☐ |
| 6.11 | Feed during replay | Observe feed panel | Shows replayed events in reverse order | ☐ |
| 6.12 | Replay with customer | Set customer filter → Load → Play | Only shows events for selected customer | ☐ |

---

## 7. Customer Filter

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 7.1 | Filter in Map mode | Select "CMWI" | Map shows only CMWI sites, feed shows CMWI events | ☐ |
| 7.2 | Filter in Graph mode | Select "CMWI" → switch to Graph | Graph shows only CMWI topology nodes | ☐ |
| 7.3 | All Customers | Select "All Customers" | All sites/nodes visible | ☐ |
| 7.4 | Data refresh | Change customer filter | Data reloads from API with customer param | ☐ |

---

## 8. Graph Mode — Topology Display

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 8.1 | Switch to Graph | Click "Graph" toggle | ReactFlow canvas renders with topology nodes | ☐ |
| 8.2 | Node rendering | Observe nodes | Custom nodes with: icon (by type), label, hostname | ☐ |
| 8.3 | Node type icons | Check different node types | Server=blue box, Firewall=amber shield, Endpoint=green monitor, etc. | ☐ |
| 8.4 | Edge rendering | Observe links | Edges with labels (e.g. "lan"), colored by type | ☐ |
| 8.5 | VPN edge animation | Edge with type "vpn" | Animated dashed line | ☐ |
| 8.6 | Background grid | Observe canvas | Dark grid pattern (#1d1d23 dots) | ☐ |
| 8.7 | MiniMap | Observe bottom-right | Mini overview map showing node positions and colors | ☐ |
| 8.8 | Zoom - scroll | Scroll wheel on canvas | Canvas zooms in/out | ☐ |
| 8.9 | Pan - drag | Drag empty area | Canvas pans | ☐ |
| 8.10 | No node palette | Observe left side | NO sidebar with Server/Firewall/etc buttons | ☐ |
| 8.11 | No zoom controls | Observe top-left area | NO +/- zoom control buttons | ☐ |
| 8.12 | No live feed | Observe bottom | NO attack feed in Graph mode | ☐ |
| 8.13 | Empty state | No topology nodes for customer | "No topology nodes yet" message with guidance | ☐ |
| 8.14 | Fit view | Graph loads | Automatically fits all nodes in viewport | ☐ |

---

## 9. Graph Mode — Node Interactions

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 9.1 | Drag node | Click-drag a node | Node moves to new position | ☐ |
| 9.2 | Auto-save position | Drag node → release | Position auto-saved to backend (PUT /api/threatmap/topology/positions) | ☐ |
| 9.3 | Save positions button | Click save icon in toolbar | All positions saved (manual trigger) | ☐ |
| 9.4 | Node connection handles | Observe node edges | 4 handles: top, bottom, left, right (small gray dots) | ☐ |
| 9.5 | Create link - drag | Drag from source handle to target handle | New edge created with label "lan" | ☐ |
| 9.6 | Link saved to API | Create link | POST /api/threatmap/topology/links called | ☐ |

---

## 10. Graph Mode — Link Editing

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 10.1 | Click edge | Click a link/edge between nodes | "Edit Link" panel opens on left side | ☐ |
| 10.2 | Panel content | Observe edit panel | Description input, color picker, Save button, Delete button | ☐ |
| 10.3 | Description pre-filled | Check description input | Current label shown (e.g. "lan") | ☐ |
| 10.4 | Edit description | Change "lan" to "fiber" → Save | Edge label updates to "fiber" | ☐ |
| 10.5 | Change color | Click a color circle (e.g. blue) → Save | Edge line color changes to blue | ☐ |
| 10.6 | Color options | Count color circles | 7 colors: gray, blue, purple, green, amber, red, white | ☐ |
| 10.7 | Selected color indicator | Observe selected color | White border on selected color circle | ☐ |
| 10.8 | Delete link | Click red trash button | Edge removed from graph | ☐ |
| 10.9 | Delete saved to API | Delete a link | DELETE /api/threatmap/topology/links/{id} called | ☐ |
| 10.10 | Close panel | Click X button | Edit panel closes, no edge selected | ☐ |
| 10.11 | API persistence | Edit link → refresh page | Changes persist after reload | ☐ |

---

## 11. Graph Mode — Add Node

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 11.1 | Open Add Node | Click "+ Add Node" button | Side panel slides in from right | ☐ |
| 11.2 | Label field | Type "Web Server 1" | Label input accepts text | ☐ |
| 11.3 | Type selector | Click type dropdown | 8 options: Server, Firewall, Endpoint, Database, Cloud, SIEM, Router, Switch | ☐ |
| 11.4 | Hostname search | Type in hostname field | Autocomplete dropdown appears with matching asset names | ☐ |
| 11.5 | Hostname select | Click an asset from dropdown | Hostname field populated | ☐ |
| 11.6 | Hostname clear | Click X in hostname field | Hostname cleared | ☐ |
| 11.7 | Customer select | Select from customer dropdown | Customer assigned to node | ☐ |
| 11.8 | Lat/Lng inputs | Enter coordinates | Accepts decimal numbers | ☐ |
| 11.9 | Create Node | Fill required fields → click "Create Node" | Node appears in graph, panel closes | ☐ |
| 11.10 | Create disabled | Leave label empty | "Create Node" button is disabled | ☐ |
| 11.11 | Close panel | Click X | Panel closes without creating | ☐ |
| 11.12 | Node visible on Map | Create node with lat/lng → switch to Map | New site marker visible on map | ☐ |

---

## 12. Graph Mode — Export/Import

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 12.1 | Export JSON | Click download icon | JSON file downloads: topology-{customer}-{date}.json | ☐ |
| 12.2 | JSON content | Open downloaded file | Contains nodes array, links array, exportedAt, customer | ☐ |
| 12.3 | Import JSON | Click upload icon → select file | Confirm dialog: "Import X nodes?" | ☐ |
| 12.4 | Import confirm | Click OK on confirm | Nodes created, data reloads | ☐ |
| 12.5 | Import cancel | Click Cancel on confirm | No nodes created | ☐ |
| 12.6 | Import invalid file | Upload non-JSON file | "Invalid topology JSON" alert | ☐ |
| 12.7 | Screenshot PNG | Click camera icon | PNG file downloads with topology text summary | ☐ |

---

## 13. Mode Switching

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 13.1 | Map → Graph | Click "Graph" | Switches to ReactFlow canvas, toolbar changes (Add Node, Save, Export, etc.) | ☐ |
| 13.2 | Graph → Map | Click "Map" | Switches to Leaflet map, toolbar changes (Replay button) | ☐ |
| 13.3 | Customer persists | Set customer in Map → switch to Graph | Same customer filter applied | ☐ |
| 13.4 | Rapid switching | Click Map/Graph quickly multiple times | No errors or state corruption | ☐ |
| 13.5 | Replay hidden in Graph | Switch to Graph | Replay button not visible | ☐ |
| 13.6 | Graph tools hidden in Map | Switch to Map | Add Node / Save / Export buttons not visible | ☐ |

---

## 14. Visual / Design Compliance

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 14.1 | Background color | Observe page | #0a0a0c background | ☐ |
| 14.2 | Top bar styling | Observe header | Rounded-lg, semi-transparent bg, #26262e border | ☐ |
| 14.3 | Button styling | Check all buttons | Consistent: dark bg, #26262e border, proper hover states | ☐ |
| 14.4 | Node colors | Check different node types | Server=blue, Firewall=amber, Endpoint=green, Database=gray, Cloud=purple, SIEM=red | ☐ |
| 14.5 | Edge label style | Observe edge labels | Small gray text, dark background | ☐ |
| 14.6 | Full height | Observe page | Map/Graph fills viewport height minus nav bar | ☐ |
| 14.7 | MiniMap style | Observe minimap | Dark background (#141418), #26262e border | ☐ |
