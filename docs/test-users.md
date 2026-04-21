# Test Plan — User Management

**Module:** Users  
**URL:** `http://<host>/` → Tab "Users"  
**Last Updated:** 2026-04-21  

---

## 1. Access Control

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 1.1 | Admin visibility | Login as superadmin → observe tabs | "Users" tab visible in navigation | ☐ |
| 1.2 | Admin visibility (admin role) | Login as admin → observe tabs | "Users" tab visible | ☐ |
| 1.3 | Non-admin hidden | Login as customer/viewer → observe tabs | "Users" tab NOT visible | ☐ |
| 1.4 | Direct URL blocked | Login as viewer → navigate to Users page programmatically | Page doesn't render or shows unauthorized | ☐ |

---

## 2. Page Load & Initial State

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 2.1 | Page loads | Click "Users" tab | User Management page renders | ☐ |
| 2.2 | Header | Observe page header | "User Management" title with user count badge | ☐ |
| 2.3 | User table | Observe main table | Columns: User, Role, Customer, Status, Actions | ☐ |
| 2.4 | User count | Compare badge with rows | Badge number matches table row count | ☐ |
| 2.5 | Loading state | Navigate to Users (slow network) | "Loading users..." shown while fetching | ☐ |
| 2.6 | "Add User" button | Observe header | "Add User" button visible | ☐ |
| 2.7 | Data from API | Check Network tab | `GET /api/auth/users` called | ☐ |

---

## 3. User Table Display

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 3.1 | User column | Observe user cells | Display name + @username format | ☐ |
| 3.2 | Role badges | Observe role column | Color-coded badges: SuperAdmin (red), Admin (amber), Customer (blue), Viewer (gray) | ☐ |
| 3.3 | Customer column | Observe customer column | Shows customer name or "—" for non-customer roles | ☐ |
| 3.4 | Status badge | Observe status column | Green "Active" or Gray "Disabled" badge | ☐ |
| 3.5 | Action buttons | Observe actions column | Edit (pencil) and Delete (trash) icons | ☐ |
| 3.6 | Row styling | Observe table rows | Proper borders, hover state, alternating shading | ☐ |

---

## 4. Create User

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4.1 | Open create modal | Click "Add User" button | Create/Edit modal opens with empty fields | ☐ |
| 4.2 | Username field | Observe form | Username text input, enabled | ☐ |
| 4.3 | Password field | Observe form | Password input (type=password) | ☐ |
| 4.4 | Display Name field | Observe form | Text input for display name | ☐ |
| 4.5 | Role selector | Click role dropdown | 4 options: Super Admin, Admin, Customer, Viewer | ☐ |
| 4.6 | Customer field | Select "Customer" role | Customer text input appears/required | ☐ |
| 4.7 | Submit valid user | Fill all fields → click Save | User created, modal closes, table refreshes with new user | ☐ |
| 4.8 | Submit empty username | Leave username blank → Save | Validation error: "Username and password are required" | ☐ |
| 4.9 | Submit empty password | Leave password blank → Save | Validation error shown | ☐ |
| 4.10 | Duplicate username | Create user with existing username | API error displayed (red error banner) | ☐ |
| 4.11 | Cancel create | Click Cancel button | Modal closes, no user created | ☐ |
| 4.12 | Loading state | Submit form | Button shows loading spinner while saving | ☐ |
| 4.13 | API call | Submit valid user → check Network | `POST /api/auth/users` called with correct payload | ☐ |

---

## 5. Edit User

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 5.1 | Open edit modal | Click pencil icon on a user row | Modal opens with user's current data pre-filled | ☐ |
| 5.2 | Username disabled | Observe username field | Username input is disabled (read-only) | ☐ |
| 5.3 | Password optional | Observe password field | Placeholder: "Leave blank to keep current" | ☐ |
| 5.4 | Change display name | Edit display name → Save | Name updated in table | ☐ |
| 5.5 | Change role | Change role from Admin to Viewer → Save | Role badge updates in table | ☐ |
| 5.6 | Change password | Enter new password → Save | User can login with new password | ☐ |
| 5.7 | Keep password | Leave password blank → Save | Password unchanged, user can still login with old password | ☐ |
| 5.8 | Cancel edit | Make changes → click Cancel | Modal closes, no changes saved | ☐ |
| 5.9 | API call | Save edit → check Network | `PUT /api/auth/users/{id}` called | ☐ |

---

## 6. Delete User

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 6.1 | Delete button | Click trash icon on a user row | Browser confirm dialog: "Are you sure?" | ☐ |
| 6.2 | Confirm delete | Click OK on confirm dialog | User removed from table | ☐ |
| 6.3 | Cancel delete | Click Cancel on confirm dialog | User remains in table | ☐ |
| 6.4 | API call | Confirm delete → check Network | `DELETE /api/auth/users/{id}` called | ☐ |
| 6.5 | Cannot delete self | Try to delete currently logged-in user | Should be prevented or show warning | ☐ |
| 6.6 | Table refresh | After delete | Table refreshes, user count badge decrements | ☐ |

---

## 7. Status Toggle

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 7.1 | Disable user | Click status toggle on Active user | Status changes to "Disabled" | ☐ |
| 7.2 | Enable user | Click status toggle on Disabled user | Status changes to "Active" | ☐ |
| 7.3 | API call | Toggle status → check Network | `PUT /api/auth/users/{id}` with `{ is_active: false/true }` | ☐ |
| 7.4 | Disabled user login | Disable a user → try login as that user | Login fails with appropriate error | ☐ |
| 7.5 | Re-enable login | Re-enable user → login | Login succeeds | ☐ |

---

## 8. Role-Based Behavior

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 8.1 | SuperAdmin role | Create user with SuperAdmin → login | Can see all tabs including Users | ☐ |
| 8.2 | Admin role | Create Admin user → login | Can see Users tab | ☐ |
| 8.3 | Customer role | Create Customer user with customer "CMWI" → login | Cannot see Users tab, data scoped to CMWI | ☐ |
| 8.4 | Viewer role | Create Viewer user → login | Cannot see Users tab, read-only access | ☐ |

---

## 9. Error Handling

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 9.1 | API error on load | Simulate backend down → navigate to Users | Error message displayed | ☐ |
| 9.2 | API error on create | Trigger server error during create | Red error banner with error message | ☐ |
| 9.3 | API error on delete | Trigger server error during delete | Error displayed, user still in table | ☐ |
| 9.4 | Network timeout | Slow response | Loading state shown, no crash | ☐ |

---

## 10. Visual / Design Compliance

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 10.1 | Theme consistency | Compare with other pages | Same dark theme, fonts, colors | ☐ |
| 10.2 | Table styling | Observe user table | Proper borders, padding, hover states | ☐ |
| 10.3 | Modal styling | Open create/edit modal | Dark background, proper form field styling | ☐ |
| 10.4 | Role badge colors | Verify all 4 role badges | SuperAdmin=red, Admin=amber, Customer=blue, Viewer=gray | ☐ |
| 10.5 | Status badge colors | Verify badges | Active=green, Disabled=gray | ☐ |
| 10.6 | Button states | Check disabled/loading | Proper opacity change, spinner on loading | ☐ |
| 10.7 | Responsive | Resize browser | Table adapts to screen size | ☐ |
