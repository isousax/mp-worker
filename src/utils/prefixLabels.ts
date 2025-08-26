const prefixMap: Record<string, string> = {
    nossa_historia: "P-",
    infinito_particular: "I-"
};

export function prefixLabels(intentionId: string): string | null {
    const prefix = intentionId.replace(/-.+/, '').toUpperCase();
    return prefixMap[prefix] ?? null;
}
