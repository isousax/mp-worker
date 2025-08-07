export function planLabels(plan: string): string {
    switch (plan) {
        case "premium":
            return "🥇 Plano Premium";
        case "standard":
            return "⭐ Plano Intermediário";
        case "basic":
            return "💰 Plano Básico";
        default:
            return "Plano Desconhecido";
    }
}