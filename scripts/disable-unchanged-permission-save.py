from pathlib import Path

path = Path('artifacts/fawri/src/components/admin/AdministratorsTab.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '''  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [updatingAdministratorStatusId, setUpdatingAdministratorStatusId] =
''',
    '''  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const originalPermissions = selectedAdministrator?.permissions ?? [];
  const hasPermissionChanges =
    selectedAdministrator?.admin_role === "assistant_admin" &&
    (selectedPermissions.length !== originalPermissions.length ||
      selectedPermissions.some(
        (permission) => !originalPermissions.includes(permission),
      ));
  const [updatingAdministratorStatusId, setUpdatingAdministratorStatusId] =
''',
    'permission change state',
)

replace_once(
    '''      isSavingPermissions ||
      !selectedAdministrator ||
      selectedAdministrator.admin_role !== "assistant_admin"
''',
    '''      isSavingPermissions ||
      !hasPermissionChanges ||
      !selectedAdministrator ||
      selectedAdministrator.admin_role !== "assistant_admin"
''',
    'prevent unchanged permission save',
)

replace_once(
    '''              disabled={isSavingPermissions || !selectedAdministrator}
              onClick={() => void handleSavePermissions()}
''',
    '''              disabled={
                isSavingPermissions ||
                !selectedAdministrator ||
                !hasPermissionChanges
              }
              onClick={() => void handleSavePermissions()}
''',
    'disable unchanged save button',
)

path.write_text(text, encoding='utf-8')
print('Disabled permission saving until the selected permissions actually change.')
