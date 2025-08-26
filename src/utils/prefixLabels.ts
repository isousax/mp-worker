const prefixMap: Record<string, string> = {
    nossa_historia: "P-",
    infinito_particular: "I-"
};

export function prefixLabels(intentionId: string): string | null {
    return prefixMap[intentionId] ?? null;
}
