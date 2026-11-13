# ITT Application Regression Test Plan - Performance & Load Testing

## Application Overview

The ITT (Smart Navigator) is a comprehensive logistics and shipment tracking system designed for managing global shipments across multiple modes of transport (Ocean, Air, Rail, Road). The application provides real-time tracking, alerts, data management, and user management capabilities. This regression test plan covers all major navigation tabs and sub-sections with focus on performance and load time metrics for each page visit. The system handles multiple companies and provides features for shipment tracking, favorites management, alert subscriptions, 3PL operations, and comprehensive data management. The test scenarios document baseline performance metrics for regression detection.

## Test Scenarios

### 1. Home Page Navigation & Performance

**Seed:** `tests/seed.spec.ts`

#### 1.1. Home Page Load Time and Initial Dashboard Display

**File:** `tests/home/home-page-load.spec.ts`

**Steps:**
  1. Navigate to Home page using the Home menu link
    - expect: Page loads successfully
    - expect: URL matches #/home
    - expect: Dashboard with KPI cards (Not Started Shipments, Arrived Shipments, In Transit Shipments) displays
    - expect: Global Shipment Overview map renders
    - expect: Mode of Transport tabs display (Ocean, Air, Rail, Road)
  2. Measure and record page load time using browser performance API
    - expect: Page load time is recorded in milliseconds
    - expect: DOM Content Loaded event time is captured
    - expect: Page fully interactive within acceptable threshold (< 5000ms)
    - expect: All images and assets loaded
  3. Verify dashboard metrics load completely
    - expect: Not Started Shipments count displays (313)
    - expect: Arrived Shipments count displays (3,966)
    - expect: In Transit Shipments count displays (1,278)
    - expect: Transport mode breakdown shows for each KPI card (Ocean, Air, Rail, Road)
  4. Verify map widget renders without errors
    - expect: Global Shipment Overview map displays with markers
    - expect: Zoom in/out buttons are functional
    - expect: Map type selector is available
    - expect: No console errors related to map rendering
  5. Verify responsive design and layout stability
    - expect: All dashboard elements properly aligned
    - expect: KPI cards display in grid format
    - expect: Map widget takes appropriate viewport space
    - expect: No overlapping elements
    - expect: Footer with EULA and copyright information visible

#### 1.2. Home Page Filter and Search Functionality

**File:** `tests/home/home-filters-search.spec.ts`

**Steps:**
  1. Open Home page and locate Global Search field
    - expect: Global Search textbox is visible
    - expect: Placeholder text guides user input
    - expect: Show filters button is available
  2. Click on Show filters button and measure response time
    - expect: Filter panel expands within 500ms
    - expect: Filter options display without delay
    - expect: No layout shift occurs
    - expect: Filter UI is fully interactive
  3. Test filter panel responsiveness with various filter selections
    - expect: Filter selections apply instantly
    - expect: Dashboard updates reflect filter criteria
    - expect: Performance remains stable with filters applied

#### 1.3. Home Page Transport Mode Tab Switching

**File:** `tests/home/home-transport-tabs.spec.ts`

**Steps:**
  1. On Home page, verify Mode of Transport tabs are visible and clickable
    - expect: Ocean tab is selected by default
    - expect: Air, Rail, Road tabs are available
    - expect: All tabs are clickable and responsive
  2. Click on each transport mode tab and measure tab switch time
    - expect: Tab switches within 300ms
    - expect: Content updates without full page reload
    - expect: No visual glitching or flashing
    - expect: Tab selection state updates immediately
  3. Verify data accuracy for each transport mode
    - expect: Ocean mode shows correct shipment data
    - expect: Air mode displays appropriate data (0 shown for this dataset)
    - expect: Rail mode displays correctly (0 shown)
    - expect: Road mode displays correctly (0 shown)

### 2. Tracking List Tab Performance

**Seed:** `tests/seed.spec.ts`

#### 2.1. Tracking List Page Load and Initial Data Display

**File:** `tests/tracking-list/tracking-list-load.spec.ts`

**Steps:**
  1. Click on Tracking List menu item
    - expect: Navigation to Tracking List page successful
    - expect: URL changes to #/tracking-list
    - expect: Page breadcrumb shows 'Tracking List'
  2. Measure Tracking List page load time and data rendering
    - expect: Page loads within 5000ms
    - expect: DOM Content Loaded fires promptly
    - expect: In Transit tab is selected by default
    - expect: Table header with 20+ columns displays
    - expect: Initial data rows render (showing 10 entries from 1955 total)
  3. Verify column headers and table structure
    - expect: Action column displays first
    - expect: Shipment Number column with filter options
    - expect: MOT (Mode of Transport) column displays
    - expect: Port of Departure/Entry columns visible
    - expect: All date columns present (Predictive ETA, ETD, Request ETA)
    - expect: SBU and code columns display
    - expect: Shipper Reference and Transport Reference columns visible
    - expect: Vessel Name and date columns present
  4. Verify pagination controls load and function
    - expect: Showing entry counter displays (1 to 10 of 1955)
    - expect: Pagination buttons present (First, Previous, Next, Last)
    - expect: Page number buttons display (1-5 visible, with ability to navigate)
    - expect: Rows per page dropdown available and set to 10
    - expect: Pagination controls are functional
  5. Record performance metrics
    - expect: Initial table render time documented
    - expect: Time to first interactive content recorded
    - expect: Network request count for data fetch noted

#### 2.2. Tracking List Tab Switching Performance

**File:** `tests/tracking-list/tracking-list-tabs.spec.ts`

**Steps:**
  1. On Tracking List page, identify all available tabs
    - expect: All Shipments tab available
    - expect: Not Started tab available
    - expect: In Transit tab visible and selected
    - expect: Arrived tab available
    - expect: Document Only tab available
    - expect: Inactive Shipments tab available
    - expect: Live Track Pending tab available
  2. Click on each tab sequentially and measure switch time and data load
    - expect: Each tab switches within 300ms
    - expect: Tab content loads fresh data
    - expect: Table updates with tab-specific records
    - expect: No layout shift or visual artifacts
    - expect: All tabs maintain performance consistency
  3. Verify data accuracy for each tab
    - expect: In Transit tab shows In Transit shipments
    - expect: Arrived tab shows Arrived shipments
    - expect: Not Started tab shows Not Started shipments
    - expect: Each tab reflects current data state

#### 2.3. Tracking List Search and Filter Operations

**File:** `tests/tracking-list/tracking-list-search-filter.spec.ts`

**Steps:**
  1. Locate search field and filter button on Tracking List
    - expect: Global Search textbox displays (requires min 3 characters)
    - expect: Search icon/clear button available
    - expect: Show filters button present
  2. Type search term with minimum 3 characters and measure response time
    - expect: Search filters table results within 500ms
    - expect: Results update without full page reload
    - expect: Matching shipments displayed
    - expect: Non-matching rows removed from view
  3. Click on column header filter menus
    - expect: Filter menu opens for clickable headers
    - expect: Filter options display
    - expect: Filter selections apply correctly
    - expect: Table data updates based on filters
  4. Test filter responsiveness and performance
    - expect: Filters apply within 500ms
    - expect: Multiple filters can be combined
    - expect: Performance remains acceptable with filters

#### 2.4. Tracking List Pagination and Data Navigation

**File:** `tests/tracking-list/tracking-list-pagination.spec.ts`

**Steps:**
  1. On Tracking List page, verify pagination works correctly
    - expect: First Page button moves to page 1
    - expect: Previous Page button disabled on page 1
    - expect: Page numbers 1-5 clickable
    - expect: Next Page button enables navigation
    - expect: Last Page button navigates to final page
  2. Measure page navigation response time for each action
    - expect: Page change loads within 500ms
    - expect: Table data updates without full reload
    - expect: Entry counter updates (e.g., 1 to 10 of 1955)
    - expect: Pagination buttons update state appropriately
  3. Change rows per page setting
    - expect: Rows per page dropdown selectable
    - expect: Selection updates table immediately
    - expect: Entry counter reflects new row count
    - expect: Performance acceptable with increased row count
  4. Verify data consistency across pages
    - expect: No duplicate entries across pagination
    - expect: All shipment data correctly displayed
    - expect: Sorting and ordering maintained

#### 2.5. Tracking List Column Customization

**File:** `tests/tracking-list/tracking-list-columns.spec.ts`

**Steps:**
  1. Locate Column Settings button on Tracking List
    - expect: Column Settings button/dropdown visible
    - expect: Column settings icon displays
    - expect: Clicking opens column configuration interface
  2. Open Column Settings and measure response time
    - expect: Settings panel opens within 300ms
    - expect: All available columns listed
    - expect: Column visibility toggle options present
  3. Interact with Save Column Preference button
    - expect: Save Column Preference button available (may be disabled initially)
    - expect: User can toggle column visibility
    - expect: Preferences can be saved
  4. Verify Download functionality
    - expect: Download button is functional
    - expect: Download completes within acceptable time
    - expect: Data exports in expected format

### 3. Favorites Tab Performance

**Seed:** `tests/seed.spec.ts`

#### 3.1. Favorites Page Load and Empty State

**File:** `tests/favorites/favorites-load.spec.ts`

**Steps:**
  1. Click on Favorites menu item
    - expect: Navigation to Favorites page successful
    - expect: URL changes to #/favorites
    - expect: Page breadcrumb shows 'Favorites'
  2. Measure Favorites page load time
    - expect: Page loads within 4000ms
    - expect: DOM Content Loaded fires promptly
    - expect: Empty state message displays 'No shipments found'
    - expect: Table structure loads with all column headers
  3. Verify Favorites page layout and structure
    - expect: Search field available at top
    - expect: Filter button present
    - expect: Column Settings button available
    - expect: Download button present
    - expect: Table with proper headers displays
    - expect: Pagination controls present
    - expect: Entry counter shows 'Showing 0 to 0 of 0 entries'
  4. Verify empty state handling
    - expect: No Data message displays clearly
    - expect: No shipments found image visible
    - expect: Pagination disabled appropriately
    - expect: Rows per page dropdown disabled in empty state
  5. Test page responsiveness and stability
    - expect: No console errors
    - expect: Layout is stable and properly formatted
    - expect: All interactive elements functional

#### 3.2. Favorites Search and Filtering (Empty State)

**File:** `tests/favorites/favorites-empty-search.spec.ts`

**Steps:**
  1. On empty Favorites page, test search functionality
    - expect: Search field is functional
    - expect: Search accepts input
    - expect: No errors on search attempt
    - expect: Results remain empty as expected
  2. Test filter button functionality on empty state
    - expect: Filter button responds to clicks
    - expect: Filter panel opens if applicable
    - expect: No errors in filter interaction

### 4. Alerts (Alert Subscription) Tab Performance

**Seed:** `tests/seed.spec.ts`

#### 4.1. Alerts Page Load and Display

**File:** `tests/alerts/alerts-load.spec.ts`

**Steps:**
  1. Click on Alert menu item
    - expect: Navigation to Alert Subscription page successful
    - expect: URL changes to #/alert-subscription
    - expect: Page breadcrumb shows 'Alert Subscription'
  2. Measure Alert Subscription page load time
    - expect: Page loads within 4000ms
    - expect: All content renders completely
    - expect: Header information section displays
    - expect: Add Alert button visible and functional
  3. Verify information banner displays
    - expect: Information banner visible at top of table
    - expect: Banner text explains default alerts included in bulk CSV
    - expect: Close button present on information banner
    - expect: Banner styling correct
  4. Verify alerts table loads with data
    - expect: Table header with multiple columns displays
    - expect: Alert data row shows 'Consolidated Ocean Alerts Q1'
    - expect: Entry counter shows 'Showing 1 to 1 of 1 entries'
    - expect: All alert details visible in row
  5. Verify table columns and content
    - expect: Action column with edit/delete buttons
    - expect: Alert Name column shows 'Consolidated Ocean Alerts Q1'
    - expect: Company column shows 'BDP Modified'
    - expect: MOT column shows 'OCEAN'
    - expect: CSR column shows 'John Doe'
    - expect: Origin Region shows 'North America'
    - expect: Origin Country shows 'USA'
    - expect: POD shows 'Port of Savannah'
    - expect: Destination Region shows 'Europe'
    - expect: Destination Country shows 'Germany'
    - expect: POA shows 'Port of Hamburg'
    - expect: Role Status shows 'Early Late'
    - expect: Alert Category shows 'Default'
    - expect: Email IDs display 'user1@example.com, user2@example.com'
    - expect: Start Date shows 'Dec 31, 2025'
    - expect: End Date shows 'May 31, 2026'
  6. Record performance metrics
    - expect: Page load time documented
    - expect: Time to render alerts table recorded
    - expect: Network request metrics captured

#### 4.2. Alerts Add and Manage Operations

**File:** `tests/alerts/alerts-manage.spec.ts`

**Steps:**
  1. Locate and interact with Add Alert button
    - expect: Add Alert button is visible and clickable
    - expect: Button click opens alert creation dialog/form
    - expect: Dialog loads within 500ms
  2. Test Edit functionality on existing alert
    - expect: Edit button (pencil icon) available for alert row
    - expect: Clicking edit opens alert editing interface
    - expect: Form or dialog displays alert details for editing
  3. Test Delete functionality
    - expect: Delete button (trash icon) available for alert row
    - expect: Delete action prompts confirmation
    - expect: Delete can be cancelled or confirmed
  4. Verify pagination functionality
    - expect: Pagination controls visible
    - expect: Page navigation works correctly
    - expect: Entry counter updates appropriately

### 5. 3PL Module Performance

**Seed:** `tests/seed.spec.ts`

#### 5.1. 3PL Menu Expansion and Sub-section Navigation

**File:** `tests/3pl/3pl-navigation.spec.ts`

**Steps:**
  1. Click on 3PL menu item to expand dropdown
    - expect: 3PL menu expands showing sub-sections
    - expect: Submenu appears with 4 options: Upload, Exception Manager, Event Manager, Shipment Reprocessing
  2. Verify each 3PL sub-section is clickable
    - expect: Upload link is clickable
    - expect: Exception Manager link is clickable
    - expect: Event Manager link is clickable
    - expect: Shipment Reprocessing link is clickable

#### 5.2. 3PL Upload Page Load

**File:** `tests/3pl/3pl-upload-load.spec.ts`

**Steps:**
  1. Click on 3PL > Upload menu item
    - expect: Navigation successful
    - expect: URL changes to #/3pl/upload
    - expect: Page breadcrumb shows 3PL > Upload path
  2. Measure 3PL Upload page load time
    - expect: Page loads within 4000ms
    - expect: Upload interface displays
    - expect: Form or upload widget renders
    - expect: Page is responsive and interactive
  3. Verify upload interface functionality
    - expect: File upload input available
    - expect: File selection works
    - expect: Upload progress indication available if applicable

#### 5.3. 3PL Exception Manager Load

**File:** `tests/3pl/3pl-exception-manager-load.spec.ts`

**Steps:**
  1. Click on 3PL > Exception Manager menu item
    - expect: Navigation successful
    - expect: URL changes to #/3pl/exception-manager
    - expect: Page breadcrumb shows 3PL > Exception Manager
  2. Measure Exception Manager page load time
    - expect: Page loads within 4000ms
    - expect: Exception list/table displays
    - expect: Search and filter options available
    - expect: Page fully interactive
  3. Verify exception manager interface
    - expect: Exception data displays in table format
    - expect: Column headers present
    - expect: Action buttons available for exception management

#### 5.4. 3PL Event Manager Load

**File:** `tests/3pl/3pl-event-manager-load.spec.ts`

**Steps:**
  1. Click on 3PL > Event Manager menu item
    - expect: Navigation successful
    - expect: URL changes to #/3pl/event-manager
    - expect: Page breadcrumb shows 3PL > Event Manager
  2. Measure Event Manager page load time
    - expect: Page loads within 4000ms
    - expect: Event list/dashboard displays
    - expect: Event data renders properly
    - expect: Interface is responsive
  3. Verify event manager functionality
    - expect: Events display in readable format
    - expect: Search/filter capabilities available
    - expect: Event details accessible

#### 5.5. 3PL Shipment Reprocessing Load

**File:** `tests/3pl/3pl-shipment-reprocessing-load.spec.ts`

**Steps:**
  1. Click on 3PL > Shipment Reprocessing menu item
    - expect: Navigation successful
    - expect: URL changes to #/3pl/shipment-reprocessing
    - expect: Page breadcrumb shows 3PL > Shipment Reprocessing
  2. Measure Shipment Reprocessing page load time
    - expect: Page loads within 4000ms
    - expect: Reprocessing interface displays
    - expect: Options for reprocessing available
    - expect: Page is fully interactive
  3. Verify shipment reprocessing interface
    - expect: Shipment selection mechanism available
    - expect: Reprocessing action buttons present
    - expect: Status indicators display appropriately

### 6. Data Management Module Performance

**Seed:** `tests/seed.spec.ts`

#### 6.1. Data Management Menu Expansion and Navigation

**File:** `tests/data-mgmt/data-mgmt-navigation.spec.ts`

**Steps:**
  1. Click on Data Management menu item to expand dropdown
    - expect: Data Management menu expands showing 6 sub-sections
    - expect: Submenu displays: Exception Manager, Exception Configurator, Event Manager, Geofence Manager, Shipment Reprocessing, BDP Report Email Manager
  2. Verify each Data Management sub-section is accessible
    - expect: Exception Manager link clickable
    - expect: Exception Configurator link clickable
    - expect: Event Manager link clickable
    - expect: Geofence Manager link clickable
    - expect: Shipment Reprocessing link clickable
    - expect: BDP Report Email Manager link clickable

#### 6.2. Data Management Exception Manager Load

**File:** `tests/data-mgmt/data-mgmt-exception-mgr-load.spec.ts`

**Steps:**
  1. Click on Data Management > Exception Manager
    - expect: Navigation successful
    - expect: URL changes to #/data-management/exception-manager
    - expect: Page breadcrumb shows Data Management > Exception Manager
  2. Measure Exception Manager page load time
    - expect: Page loads within 4000ms
    - expect: Exception data displays
    - expect: Table or list interface renders
    - expect: Search/filter options available
  3. Verify Data Management Exception Manager interface
    - expect: Exception records display
    - expect: Management actions available
    - expect: Interface responsive and functional

#### 6.3. Data Management Exception Configurator Load

**File:** `tests/data-mgmt/data-mgmt-exception-config-load.spec.ts`

**Steps:**
  1. Click on Data Management > Exception Configurator
    - expect: Navigation successful
    - expect: URL changes to #/data-management/exception-configurator
    - expect: Page breadcrumb shows Data Management > Exception Configurator
  2. Measure Exception Configurator page load time
    - expect: Page loads within 4000ms
    - expect: Configuration interface displays
    - expect: Settings options available
    - expect: Page fully interactive
  3. Verify exception configuration interface
    - expect: Configuration options visible
    - expect: Save/apply buttons available
    - expect: Form validation working

#### 6.4. Data Management Event Manager Load

**File:** `tests/data-mgmt/data-mgmt-event-mgr-load.spec.ts`

**Steps:**
  1. Click on Data Management > Event Manager
    - expect: Navigation successful
    - expect: URL changes to #/data-management/event-manager
    - expect: Page breadcrumb shows Data Management > Event Manager
  2. Measure Event Manager page load time
    - expect: Page loads within 4000ms
    - expect: Event management interface displays
    - expect: Event data renders
    - expect: Interface is responsive
  3. Verify event management functionality
    - expect: Events display correctly
    - expect: Event actions available
    - expect: Search/filter working

#### 6.5. Data Management Geofence Manager Load

**File:** `tests/data-mgmt/data-mgmt-geofence-mgr-load.spec.ts`

**Steps:**
  1. Click on Data Management > Geofence Manager
    - expect: Navigation successful
    - expect: URL changes to #/data-management/geofence-manager
    - expect: Page breadcrumb shows Data Management > Geofence Manager
  2. Measure Geofence Manager page load time
    - expect: Page loads within 4000ms
    - expect: Geofence interface displays (likely with map)
    - expect: Geofence data renders
    - expect: Page is interactive
  3. Verify geofence management interface
    - expect: Geofence locations visible
    - expect: Add/edit/delete actions available
    - expect: Map visualization if applicable

#### 6.6. Data Management Shipment Reprocessing Load

**File:** `tests/data-mgmt/data-mgmt-shipment-reprocess-load.spec.ts`

**Steps:**
  1. Click on Data Management > Shipment Reprocessing
    - expect: Navigation successful
    - expect: URL changes to #/data-management/shipment-reprocessing
    - expect: Page breadcrumb shows Data Management > Shipment Reprocessing
  2. Measure Shipment Reprocessing page load time
    - expect: Page loads within 4000ms
    - expect: Reprocessing interface displays
    - expect: Shipment selection mechanism available
    - expect: Page fully interactive
  3. Verify reprocessing interface
    - expect: Shipment list or selection available
    - expect: Reprocessing actions accessible
    - expect: Status feedback available

#### 6.7. Data Management BDP Report Email Manager Load

**File:** `tests/data-mgmt/data-mgmt-bdp-report-load.spec.ts`

**Steps:**
  1. Click on Data Management > BDP Report Email Manager
    - expect: Navigation successful
    - expect: URL changes to #/data-management/bdp-rep-email-manager
    - expect: Page breadcrumb shows Data Management > BDP Report Email Manager
  2. Measure BDP Report Email Manager page load time
    - expect: Page loads within 4000ms
    - expect: Report configuration interface displays
    - expect: Email settings available
    - expect: Page responsive
  3. Verify report email management interface
    - expect: Email recipient list visible
    - expect: Add/edit/remove email actions available
    - expect: Save settings functional

### 7. User Management Tab Performance

**Seed:** `tests/seed.spec.ts`

#### 7.1. User Management Page Load and User List Display

**File:** `tests/user-mgmt/user-mgmt-load.spec.ts`

**Steps:**
  1. Click on User Management menu item
    - expect: Navigation successful
    - expect: URL changes to #/user-control
    - expect: Page breadcrumb shows User Management > User Control
  2. Measure User Management page load time
    - expect: Page loads within 4000ms
    - expect: User list table renders completely
    - expect: Entry counter shows 'Showing 1 to 10 of 59 entries'
    - expect: Tabs display (Users 28, Users With Inactive Role 0)
  3. Verify User Management page structure
    - expect: Active Users tab selected by default showing 28 users
    - expect: Inactive Users tab available showing 0 users
    - expect: Search field present at top
    - expect: Table with proper column headers displays
  4. Verify user table columns
    - expect: Action column with edit/delete buttons
    - expect: User Name column with filter capability
    - expect: User Type column showing 'New' for listed users
    - expect: User Email ID column displaying email addresses
    - expect: Total Company Assigned column showing count (0 for listed users)
    - expect: Role Assigned column showing '-' for unlisted users
    - expect: Updated By column showing admin who created user
    - expect: Updated On column showing timestamp
  5. Verify user data rows display correctly
    - expect: First user 'suesmithtest test' displays with New type
    - expect: User email 'wtsdrop03@aol.com' displays correctly
    - expect: Timestamp '02-03-2026 10:28' shows accurately
    - expect: Multiple user rows (10 per page) render without performance issues
  6. Record performance metrics
    - expect: Page load time documented
    - expect: Table render time recorded
    - expect: Memory usage captured if possible

#### 7.2. User Management Tab Switching

**File:** `tests/user-mgmt/user-mgmt-tabs.spec.ts`

**Steps:**
  1. On User Management page, verify both tabs are present
    - expect: Users tab showing count 28
    - expect: Users With Inactive Role tab showing count 0
    - expect: Both tabs are clickable
  2. Switch between tabs and measure response time
    - expect: Tab switches within 300ms
    - expect: Active tab indicator updates
    - expect: Table content updates for selected tab
    - expect: No full page reload occurs
  3. Verify Users With Inactive Role tab content
    - expect: Inactive Users tab loads without delay
    - expect: Shows 0 entries as expected
    - expect: Table structure maintains consistency
    - expect: No errors on tab switch

#### 7.3. User Management Search and Filtering

**File:** `tests/user-mgmt/user-mgmt-search-filter.spec.ts`

**Steps:**
  1. Locate search field on User Management page
    - expect: Search field displays with placeholder text
    - expect: Search requires minimum 3 characters
    - expect: Field is focused and ready for input
  2. Test user search functionality
    - expect: Typing search term filters user list
    - expect: Results update within 500ms
    - expect: Matching users display in table
    - expect: Non-matching users filtered out
  3. Test column header filters
    - expect: User Name column header filter accessible
    - expect: User Type column header filter available
    - expect: Filter menus open when clicked
    - expect: Filters apply correctly to results
  4. Verify filter performance and accuracy
    - expect: Multiple filters combine correctly
    - expect: Results update accurately
    - expect: Performance remains acceptable

#### 7.4. User Management Pagination

**File:** `tests/user-mgmt/user-mgmt-pagination.spec.ts`

**Steps:**
  1. On User Management page, verify pagination controls
    - expect: Showing 1 to 10 of 59 entries displayed
    - expect: Page number buttons (1-5) visible
    - expect: First Page button disabled (on page 1)
    - expect: Previous Page button disabled (on page 1)
    - expect: Next Page button enabled
    - expect: Last Page button enabled
  2. Test page navigation and measure response time
    - expect: Clicking page 2 loads within 500ms
    - expect: Table content updates with page 2 users
    - expect: Entry counter shows 'Showing 11 to 20 of 59'
    - expect: Active page indicator updates
  3. Test rows per page dropdown
    - expect: Rows per page dropdown is clickable
    - expect: Default value is 10
    - expect: Changing value updates table display
    - expect: Entry count reflects new row setting
  4. Navigate through all pages and verify consistency
    - expect: Page 3, 4, 5 load correctly
    - expect: Last page shows remaining entries (9 users on page 6)
    - expect: No duplicate users across pages
    - expect: Data consistency maintained

#### 7.5. User Management Edit and Delete Actions

**File:** `tests/user-mgmt/user-mgmt-actions.spec.ts`

**Steps:**
  1. Locate edit and delete buttons for user rows
    - expect: Edit button (pencil icon) available for each user
    - expect: Delete button (trash icon) available for each user
    - expect: Buttons are clickable and responsive
  2. Click on edit button for a user
    - expect: Edit dialog or form opens within 500ms
    - expect: User details display in edit form
    - expect: Edit interface is fully functional
  3. Test delete functionality
    - expect: Delete button triggers confirmation
    - expect: Confirmation dialog displays
    - expect: User can confirm or cancel deletion
  4. Test action button responsiveness
    - expect: Buttons respond immediately to clicks
    - expect: No lag in interface updates
    - expect: All actions complete without errors

### 8. Cross-Browser and Responsive Design

**Seed:** `tests/seed.spec.ts`

#### 8.1. Navigation Menu Stability Across All Pages

**File:** `tests/cross-browser/nav-stability.spec.ts`

**Steps:**
  1. Navigate through all main menu items sequentially: Home, Tracking List, Favorites, Alerts, User Management
    - expect: Each page loads successfully
    - expect: Navigation menu remains visible and stable
    - expect: Menu items remain clickable
    - expect: No navigation errors occur
    - expect: Page transitions are smooth
  2. Expand and collapse 3PL menu multiple times
    - expect: Menu expansion/collapse is smooth
    - expect: No visual glitches
    - expect: Submenu items remain accessible
    - expect: Performance consistent
  3. Expand and collapse Data Management menu multiple times
    - expect: Menu handles multiple expansions smoothly
    - expect: All submenu items visible and clickable
    - expect: No performance degradation
  4. Record menu interaction performance metrics
    - expect: Menu expansion time documented (target < 200ms)
    - expect: Collapse time recorded
    - expect: No memory leaks detected on repeated operations

#### 8.2. Alert Count Indicator Performance

**File:** `tests/cross-browser/alert-indicator.spec.ts`

**Steps:**
  1. Locate Alerts badge in toolbar showing count '3'
    - expect: Alert icon displays in top toolbar
    - expect: Alert count badge shows '3'
    - expect: Badge is visible and readable
  2. Click on Alerts icon and verify navigation
    - expect: Clicking alerts icon navigates to Alert page
    - expect: URL changes to #/alert-subscription
    - expect: Alert count badge updates if necessary
  3. Verify alert indicator updates across pages
    - expect: Alert count remains consistent on all pages
    - expect: Icon visibility stable while navigating
    - expect: No performance impact from alert indicator

#### 8.3. Global Search Consistency

**File:** `tests/cross-browser/global-search.spec.ts`

**Steps:**
  1. Verify Global Search field appears on Home and Tracking List pages
    - expect: Search field visible on Home page
    - expect: Search field visible on Tracking List page
    - expect: Search field placeholder text consistent
  2. Test search functionality consistency across pages
    - expect: Search behavior consistent between pages
    - expect: Search responses equally fast
    - expect: Results format consistent

### 9. Performance Baseline and Load Time Benchmarks

**Seed:** `tests/seed.spec.ts`

#### 9.1. Page Load Time Baseline Measurements

**File:** `tests/performance/load-time-baseline.spec.ts`

**Steps:**
  1. Create baseline measurements for each major page visit
    - expect: Home page: < 5000ms
    - expect: Tracking List: < 5000ms
    - expect: Favorites: < 4000ms
    - expect: Alerts: < 4000ms
    - expect: User Management: < 4000ms
    - expect: 3PL subpages: < 4000ms each
    - expect: Data Management subpages: < 4000ms each
  2. Document DOM Content Loaded (DCL) timing for each page
    - expect: Page interactive within 2000ms for most pages
    - expect: DCL timing documented for regression comparison
  3. Record First Paint (FP) and First Contentful Paint (FCP) metrics
    - expect: First Paint < 1500ms
    - expect: First Contentful Paint < 2000ms
    - expect: Metrics recorded for all pages
  4. Document network request count and total size for each page
    - expect: Home: network requests and size documented
    - expect: Tracking List: metrics recorded
    - expect: Other pages: metrics captured for baseline
    - expect: No excessive requests identified

#### 9.2. Table Rendering Performance (Tracking List & User Management)

**File:** `tests/performance/table-render-performance.spec.ts`

**Steps:**
  1. Measure Tracking List table render time with 10 rows displayed
    - expect: Table renders within 1000ms
    - expect: 1955 total entries loaded efficiently
    - expect: Pagination mechanism functional without lag
  2. Measure User Management table render time with 10 rows
    - expect: User table renders within 1000ms
    - expect: 59 total users load efficiently
    - expect: Pagination responsive
  3. Test table performance with column filters applied
    - expect: Filtered results render within 500ms
    - expect: No noticeable lag with filters
    - expect: Performance consistent
  4. Test row per page change performance
    - expect: Changing from 10 to 25 rows renders within 1000ms
    - expect: Changing to 50 rows renders within 1500ms
    - expect: Performance scales acceptably

#### 9.3. Map Widget Performance (Home Page)

**File:** `tests/performance/map-widget-performance.spec.ts`

**Steps:**
  1. Measure Global Shipment Overview map load and render time
    - expect: Map renders within 2000ms
    - expect: 3318 shipment markers load
    - expect: Map is interactive after load
  2. Test map zoom controls responsiveness
    - expect: Zoom in/out buttons respond within 100ms
    - expect: Map updates without lag
    - expect: No performance degradation with zoom
  3. Test map type toggle performance
    - expect: Map type change completes within 500ms
    - expect: Layer switching smooth
    - expect: No visual artifacts
  4. Measure memory usage of map widget
    - expect: Map does not cause excessive memory usage
    - expect: Memory released properly on page navigation

#### 9.4. API Response Time Benchmarks

**File:** `tests/performance/api-response-times.spec.ts`

**Steps:**
  1. Document API response times for shipment list endpoints
    - expect: Tracking List data API: < 1000ms
    - expect: Favorites data API: < 1000ms
    - expect: Response times consistent on repeated calls
  2. Document API response times for alert endpoints
    - expect: Alert list API: < 1000ms
    - expect: Alert management APIs: < 500ms for CRUD operations
  3. Document API response times for user management
    - expect: User list API: < 1000ms
    - expect: User details: < 500ms
    - expect: Search queries: < 500ms
  4. Create summary of API performance baseline
    - expect: All API endpoints documented
    - expect: Response times recorded
    - expect: No API bottlenecks identified
