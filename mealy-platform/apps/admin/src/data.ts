// Permission-group labels describe the fixed administration UI. All operational records come from the Mealy API.
export const permissionGroups = [
  { name: 'Campuses', permissions: ['View campuses', 'Create campuses', 'Edit campuses', 'Suspend campuses'] },
  { name: 'Canteens', permissions: ['View canteens', 'Create canteens', 'Edit canteens', 'Suspend canteens'] },
  { name: 'Modules', permissions: ['View entitlements', 'Assign modules', 'Schedule changes'] },
  { name: 'Team & security', permissions: ['View team', 'Invite members', 'Change roles', 'Revoke sessions'] },
  { name: 'Operations', permissions: ['View operations', 'Acknowledge incidents', 'Export reports'] },
  { name: 'Platform', permissions: ['View audit log', 'Export audit log', 'Edit platform settings'] },
]
