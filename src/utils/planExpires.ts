export function planExpires(plan: string): number {
    switch (plan) {
        case "premium":
            return 12;
        case "standard":
            return 6;
        case "basic":
            return 1;
        default:
            return 0;
    }
}