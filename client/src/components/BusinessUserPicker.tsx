import { UserSearchPicker, type PickerUser } from "./UserSearchPicker";

type BusinessUserPickerProps = {
    users?: PickerUser[];
    selectedUserId?: string;
    legacyName?: string;
    placeholder?: string;
    disabled?: boolean;
    onSelect: (user: PickerUser) => void;
    onClear?: () => void;
};

export function BusinessUserPicker(props: BusinessUserPickerProps) {
    return <UserSearchPicker {...props} clearLabel="清除業務" />;
}
