import Gap from './Gap'

class LinkedListGaps {
    gaps: Gap[]
    // BIG QUESTION: What is the proper type for eventsList. Range of events we operate on?
    eventsList: string[][]

    constructor(eventsList: string[][]) {
        this.gaps = []
        this.eventsList = eventsList
    }

    find(gap: Gap):(Gap | null)[] {
        const length = this.gaps.length

        if (length === 0) {
            return [null, null]
        }

        let beginning = 0
        let end = length - 1
        let current = Math.floor((beginning + end) / 2)

        while (end > beginning && current < length - 1) {
            if (gap.getStart() >= this.gaps[current].getEnd()) {
                if (gap.getEnd() <= this.gaps[current + 1].getStart()) {
                    return [this.gaps[current], this.gaps[current + 1]]
                }
                beginning = current
                current = Math.floor((beginning + end) / 2)
            } else {
                end = current
            }
        }
        
        // edge-cases
        if (current === 0) {
            return [null, this.gaps[0]]
        }

        if (current === length - 1) {
            return [this.gaps[length - 1], null]
        }

        return [null, null]
    }

    add(gap: Gap) {
        // non-edge cases: start of gap >= end of gap' but end <= start of gap'.next => 4 cases
        // Case 1: (>, <) uwu    new gap in between two old gaps
        // Case 2: (>=, <)  ow   merge first/earlier gap with new gap. second/later gap stays intact
        // Case 3: (>, <=) ow    first/earlier gap stays intact. second/later gap merged with new gap
        // Case 4: (=>, <=) racist      merge all three gaps to make 1 big new gap.

        // edge-cases: one of the first or second are null

        const [gap_1, gap_2] = this.find(gap)
        if (gap_1 === null && gap_2 === null) {
            this.gaps.push(gap)
        } else if (gap_1 === null) {
            // is no previous gap
            this.gaps.unshift(gap)
            gap.setParent(gap_2)
        } else {
            // is no following gap
            this.gaps.push(gap)
            // find next unimportant event
        }
    }

}