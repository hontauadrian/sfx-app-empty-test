# Success Criteria Template

Use this template to define testable criteria for the QA agent.

---

## Test Configuration

```yaml
url: https://your-app.com
auth:
  required: true
  username: test@example.com
  password: ${TEST_PASSWORD}  # Use env var for secrets
viewport: desktop  # mobile | tablet | desktop | all
```

---

## Success Criteria

### Authentication

#### AC-001: Valid Login
- **Priority:** P0 (Critical)
- **Precondition:** User is logged out, on login page
- **Steps:**
  1. Enter valid email in email field
  2. Enter valid password in password field
  3. Click "Sign In" button
- **Expected:**
  - Redirect to dashboard
  - Welcome message displays username
  - No error messages visible

#### AC-002: Invalid Login - Wrong Password
- **Priority:** P0 (Critical)
- **Precondition:** User is logged out, on login page
- **Steps:**
  1. Enter valid email
  2. Enter incorrect password
  3. Click "Sign In"
- **Expected:**
  - Remain on login page
  - Error message: "Invalid credentials" (or similar)
  - Password field cleared
  - No redirect occurs

#### AC-003: Login Form Validation
- **Priority:** P1 (High)
- **Precondition:** User on login page
- **Steps:**
  1. Leave email empty
  2. Leave password empty
  3. Click "Sign In"
- **Expected:**
  - Form does not submit
  - Validation errors appear for both fields

---

### Navigation

#### NAV-001: Main Menu Links
- **Priority:** P1 (High)
- **Precondition:** User is logged in
- **Steps:**
  1. Click "Dashboard" in main nav
  2. Click "Settings" in main nav
  3. Click "Profile" in main nav
- **Expected:**
  - Each click navigates to correct page
  - URL updates appropriately
  - Page content matches navigation item

#### NAV-002: Breadcrumb Navigation
- **Priority:** P2 (Medium)
- **Precondition:** User is on a nested page (e.g., Settings > Security)
- **Steps:**
  1. Click parent breadcrumb link
- **Expected:**
  - Navigate to parent page
  - Breadcrumb updates correctly

---

### Forms

#### FORM-001: Create New [Entity]
- **Priority:** P0 (Critical)
- **Precondition:** User logged in, on [entity] list page
- **Steps:**
  1. Click "Add New" / "Create" button
  2. Fill required field: Name = "Test Entity"
  3. Fill required field: Description = "Test description"
  4. Click "Save" / "Submit"
- **Expected:**
  - Success message appears
  - Modal/form closes
  - New entity appears in list
  - Entity has correct name and description

#### FORM-002: Edit Existing [Entity]
- **Priority:** P0 (Critical)
- **Precondition:** At least one entity exists
- **Steps:**
  1. Click edit icon/button on existing entity
  2. Change Name to "Updated Entity"
  3. Click "Save"
- **Expected:**
  - Success message appears
  - List shows updated name
  - Changes persist after page refresh

#### FORM-003: Delete [Entity]
- **Priority:** P0 (Critical)
- **Precondition:** At least one entity exists
- **Steps:**
  1. Click delete icon/button on existing entity
  2. Confirm deletion in modal (if applicable)
- **Expected:**
  - Entity removed from list
  - Success message appears
  - Entity does not reappear on refresh

#### FORM-004: Required Field Validation
- **Priority:** P1 (High)
- **Precondition:** On create/edit form
- **Steps:**
  1. Clear all required fields
  2. Click Submit
- **Expected:**
  - Form does not submit
  - Error messages appear for each required field
  - Fields are highlighted/marked as invalid

#### FORM-005: Character Limits
- **Priority:** P2 (Medium)
- **Precondition:** On form with character-limited fields
- **Steps:**
  1. Enter text exceeding max length in limited field
  2. Attempt to submit
- **Expected:**
  - Either: Input is truncated to max length
  - Or: Validation error shows max length exceeded

---

### Data Display

#### DATA-001: List Pagination
- **Priority:** P1 (High)
- **Precondition:** More items exist than page size (e.g., 25+ items)
- **Steps:**
  1. Scroll to bottom of list
  2. Click "Next" or page 2
- **Expected:**
  - New set of items loads
  - Page indicator updates
  - Items are different from page 1

#### DATA-002: Search/Filter
- **Priority:** P1 (High)
- **Precondition:** Multiple items with different attributes
- **Steps:**
  1. Enter search term that matches some items
  2. Press Enter or click Search
- **Expected:**
  - List filters to matching items only
  - Non-matching items hidden
  - Clear filter restores full list

#### DATA-003: Sort Functionality
- **Priority:** P2 (Medium)
- **Precondition:** List with sortable columns
- **Steps:**
  1. Click column header to sort ascending
  2. Click again to sort descending
- **Expected:**
  - Items reorder correctly
  - Sort indicator shows direction
  - Data integrity maintained

---

### Error Handling

#### ERR-001: 404 Page
- **Priority:** P1 (High)
- **Precondition:** None
- **Steps:**
  1. Navigate to non-existent URL (e.g., /this-page-does-not-exist)
- **Expected:**
  - 404 error page displays
  - Navigation still works
  - Link to home page available

#### ERR-002: Network Error Recovery
- **Priority:** P2 (Medium)
- **Precondition:** None (may need to simulate offline)
- **Steps:**
  1. Trigger action that requires network
  2. (If possible) Interrupt network briefly
- **Expected:**
  - User-friendly error message
  - Option to retry
  - No data loss

---

### Responsive Design

#### RESP-001: Mobile Navigation
- **Priority:** P1 (High)
- **Viewport:** 375x667
- **Precondition:** User logged in
- **Steps:**
  1. Look for hamburger menu icon
  2. Tap hamburger menu
  3. Tap a navigation item
- **Expected:**
  - Menu opens as overlay/drawer
  - All nav items accessible
  - Navigation works correctly
  - Menu closes after selection

#### RESP-002: Form Usability on Mobile
- **Priority:** P1 (High)
- **Viewport:** 375x667
- **Precondition:** On a form page
- **Steps:**
  1. Tap each form field
  2. Enter text
  3. Submit form
- **Expected:**
  - Keyboard appears appropriately
  - Fields are not cut off
  - Submit button reachable
  - Form submits successfully

---

## Priority Definitions

| Priority | Meaning | Testing Requirement |
|----------|---------|---------------------|
| P0 | Critical | Must pass - blocks release |
| P1 | High | Should pass - significant user impact |
| P2 | Medium | Nice to pass - minor user impact |
| P3 | Low | Optional - edge cases |

---

## Writing Effective Criteria

### DO
- Be specific about expected outcomes
- Include exact text to look for when possible
- Specify which elements to interact with
- Note any required test data
- Keep each criterion atomic (one thing)

### DON'T
- Use vague language ("works correctly", "looks good")
- Combine multiple checks into one criterion
- Assume prior state without preconditions
- Forget to specify viewport for responsive tests
- Skip error/edge cases

### Example: Good vs Bad

**Bad:**
> The form should work and save data properly.

**Good:**
> - **Steps:** Fill "Name" with "Test User", fill "Email" with "test@example.com", click "Save"
> - **Expected:** Success toast appears with text "Saved successfully", form closes, new entry visible in list with name "Test User"
