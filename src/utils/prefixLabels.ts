const prefixMap: Record<string, string> = {
    nossa_historia: "P-",
    infinito_particular: "I-",
    bem_vindo_ao_mundo: "B-"
};

export function prefixLabels(intentionId: string): string | null {
    return prefixMap[intentionId] ?? null;
}
