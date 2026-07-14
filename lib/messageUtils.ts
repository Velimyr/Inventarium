// utils/messageUtils.ts або lib/messageUtils.ts

/**
 * Типи повідомлень
 */
export const MESSAGE_TYPES = {
    APPROVED: 'approved',
    REJECT: 'reject',
    EDIT_APPROVE: 'edit_approve',
    EDIT_REJECT: 'edit_reject',
    NEW: 'new',
    NEW_EDIT: 'new_edit',
    NEW_IDENTIFIED: 'new_identified',
    KEY_NEW: 'key_new',
    KEY_APPROVED: 'key_approved',
    KEY_REJECTED: 'key_rejected',
    KEY_EDIT_NEW: 'key_edit_new',
    KEY_EDIT_APPROVED: 'key_edit_approved',
    KEY_EDIT_REJECTED: 'key_edit_rejected',
    OTHER: 'other',
} as const;

/**
 * Тип для типів повідомлень (union type)
 */
export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];

/**
 * Повертає локалізований текст для типу повідомлення
 */
export function getMessageTypeLabel(type: MessageType | string): string {
    switch (type) {
        case MESSAGE_TYPES.APPROVED:
            return 'Ваш інвентар підтверджено'
        case MESSAGE_TYPES.REJECT:
            return 'Ваш інвентар відхилено'
        case MESSAGE_TYPES.EDIT_APPROVE:
            return 'Ваше редагування інвентарю підтверджено'
        case MESSAGE_TYPES.EDIT_REJECT:
            return 'Ваше редагування інвентарю відхилено'
        case MESSAGE_TYPES.NEW:
            return 'Новий інвентар додано'
        case MESSAGE_TYPES.NEW_EDIT:
            return 'Новий редагування інвентарю додано'
        case MESSAGE_TYPES.NEW_IDENTIFIED:
            return 'Новий інвентар ідентифіковано'
        case MESSAGE_TYPES.KEY_NEW:
            return 'Новий ключ додано'
        case MESSAGE_TYPES.KEY_APPROVED:
            return 'Ваш ключ підтверджено'
        case MESSAGE_TYPES.KEY_REJECTED:
            return 'Ваш ключ відхилено'
        case MESSAGE_TYPES.KEY_EDIT_NEW:
            return 'Запропоновано зміни до ключа'
        case MESSAGE_TYPES.KEY_EDIT_APPROVED:
            return 'Ваші зміни до ключа підтверджено'
        case MESSAGE_TYPES.KEY_EDIT_REJECTED:
            return 'Ваші зміни до ключа відхилено'
        case MESSAGE_TYPES.OTHER:
            return 'Загальне повідомлення'
        default:
            return 'Загальне повідомлення'
    }
}