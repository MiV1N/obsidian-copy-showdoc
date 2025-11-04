export let ppIsProcessing = false;
export let ppLastBlockDate = Date.now();

export function setPpIsProcessing(value: boolean) {
    ppIsProcessing = value;
}

export function setPpLastBlockDate(value: number) {
    ppLastBlockDate = value;
}
