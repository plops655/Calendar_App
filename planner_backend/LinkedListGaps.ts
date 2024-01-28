import Gap from './Gap'

class LinkedListGaps {
    gaps: Gap[]
    // BIG QUESTION: What is the proper type for eventsList. Range of events we operate on?
    // eventList ~ DateTime + INTEGERS marking intervals?
    // shifting events must affect event databases: calendars_meta, events, recurring_events

    // eventsList: {
    //     startTime: DateTime,
    //     eventIntervals:[{startInterval, endInterval, importance}, ...]
    // }

    eventsList: any
    bounds: number[]

    constructor(eventsList: any, bounds: number[]) {
        this.gaps = []
        this.eventsList = eventsList
        this.bounds = bounds
    }

    findGaps(gap: Gap):(Gap | null)[] {
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

    binarySearch(value: number, arr: Array<number>):(number | null) {
        const length = arr.length

        if (length === 0) {
            return null
        }
        
        let beginning = 0
        let end = length - 1
        let current = Math.floor((beginning + end) / 2)

        while (end > beginning && current + 1 < length) {
            if (value >= arr[current]) {
                if (value < arr[current + 1]) {
                    return current
                }
                beginning = current
                current = Math.floor((beginning + end) / 2)
            } else {
                end = current
            }
        }

        return null
    }

    findUpperBound(gapEnd: number, bounds: number[]):(number | null) {
        return this.binarySearch(gapEnd, bounds)
    }

    findNextEvent(gapEnd: number, eventIntervals:any[]) {
        if (eventIntervals.length === 0) return null
        const startIntervals = eventIntervals.map((event) => event.startInterval)
        return this.binarySearch(gapEnd, startIntervals)
    }

    isImportant(importance) {
        return importance >= 6
    }

    // return type?
    findNextUnimportant(gapEnd: number):(number | null) {
        const upperBound = this.findUpperBound(gapEnd, this.bounds)
        const nextEvent = this.findNextEvent(gapEnd, this.eventsList)

        if (upperBound === null || nextEvent === null) {
            return null
        }

        let importance: number;
        for (let i = nextEvent; i < upperBound; i += 1) {
            importance = this.eventsList.eventIntervals[i].importance
            if (!this.isImportant(importance)) {
                return i
            }
        }
        return null
    }

    add(gap: Gap) {
        // non-edge cases: start of gap >= end of gap' but end <= start of gap'.next => 4 cases
        // Case 1: (>, <)    new gap in between two old gaps
        // Case 2: (>=, <)  ow   merge first/earlier gap with new gap. second/later gap stays intact
        // Case 3: (>, <=) ow    first/earlier gap stays intact. second/later gap merged with new gap
        // Case 4: (=>, <=) racist      merge all three gaps to make 1 big new gap.

        // edge-cases: one of the first or second are null

        const [gap_1, gap_2] = this.findGaps(gap)
        if (gap_1 === null && gap_2 === null) {
            this.gaps.push(gap)
        } else if (gap_1 === null) {
            // is no previous gap and exists succeeding gap

            // first check can't be appended to succeeding gap
            if (gap.getEnd() === gap_2?.getStart()) {
                gap_2?.setStart(gap.getStart())
            } else {
                this.gaps.unshift(gap)
                gap.setParent(gap_2)
            }
        } else if (gap_2 === null) {
            // is no following gap and exists previous gap

            // TODO: find next unimportant event
            const gapEnd = gap.getEnd()
            const nextUnimportantEvent = this.findNextUnimportant(gapEnd)
            gap.setParent(null)
            gap.setEvent(nextUnimportantEvent)

            // first check if gap can be appended to previous gap!
            if (gap.getStart() === gap_1.getEnd()) {
                gap_1.setEnd(gap.getEnd())
                gap_1.setParent(null)
                gap_1.setEvent(nextUnimportantEvent)
            } else {
                gap.setParent(null)
                gap.setEvent(nextUnimportantEvent)
                this.gaps.push(gap)
            }
        } else {
            if (gap.getEnd() === gap_2.getStart() && gap.getStart() === gap_1.getEnd()) {

                gap_1.setParent(gap_2.getParent())
                gap_1.setEvent(gap_2.getEvent())
                const index = this.gaps.indexOf(gap_1)
                
                this.gaps.unshift(gap)
                gap.setParent(gap_2)
                
            }
        }
    }

}