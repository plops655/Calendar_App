import Gap from './Gap'

// TODO:
// finish coding addEvent

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

    // deal with case when # idxs returned more than 1 (i.e., more than 1 separate gap covered!!)
    findGapIdxs(startInterval: number, endInterval: number):number[] {
        const length = this.gaps.length

        if (length === 0) {
            return [-1, -1]
        }

        let beginning = 0
        let end = length - 1
        let current = Math.floor((beginning + end) / 2)

        while (end > beginning && current < length - 1) {
            if (startInterval >= this.gaps[current].getEnd()) {
                if (endInterval <= this.gaps[current + 1].getStart()) {
                    return [current, current + 1]
                }
                beginning = current
                current = Math.floor((beginning + end) / 2)
            } else {
                end = current
            }
        }
        
        // edge-cases
        if (current === 0) {
            return [-1, 0]
        }

        if (current === length - 1) {
            return [length - 1, -1]
        }

        return [-1, -1]
    }

    binarySearch(value: number, arr: Array<number>):number {
        const length = arr.length

        if (length === 0) {
            return -1
        }
        
        let beginning = 0
        let end = length - 1
        let current = Math.floor((beginning + end) / 2)

        while (end > beginning && current + 1 < length) {
            if (value >= arr[current]) {
                if (value < arr[current + 1]) {
                    return current + 1
                }
                beginning = current
                current = Math.floor((beginning + end) / 2)
            } else {
                end = current
            }
        }

        return 0
    }

    findUpperBound(gapEnd: number, bounds: number[]):number {
        return this.binarySearch(gapEnd, bounds)
    }

    findNextEvent(endInterval: number, eventIntervals:any[]):number {
        if (eventIntervals.length === 0) return -1
        const startIntervals = eventIntervals.map((event) => event.startInterval)
        return this.binarySearch(endInterval, startIntervals)
    }

    isImportant(importance) {
        return importance >= 6
    }

    // return type?
    findNextUnimportant(gapEnd: number):number {
        const upperBound = this.findUpperBound(gapEnd, this.bounds)
        const nextEvent = this.findNextEvent(gapEnd, this.eventsList)

        if (upperBound === -1 || nextEvent === -1) {
            return -1
        }

        let importance: number;
        for (let i = nextEvent; i < upperBound; i += 1) {
            importance = this.eventsList.eventIntervals[i].importance
            if (!this.isImportant(importance)) {
                return i
            }
        }
        return -1
    }

    addGap(gap: Gap):Gap {
        // non-edge cases: start of gap >= end of gap' but end <= start of gap'.next => 4 cases
        // Case 1: (>, <)    new gap in between two old gaps
        // Case 2: (>=, <)  ow   merge first/earlier gap with new gap. second/later gap stays intact
        // Case 3: (>, <=) ow    first/earlier gap stays intact. second/later gap merged with new gap
        // Case 4: (=>, <=) racist      merge all three gaps to make 1 big new gap.

        // edge-cases: one of the first or second are null

        const startInterval = gap.getStart()
        const endInterval = gap.getEnd()

        const [gap_1_idx, gap_2_idx] = this.findGapIdxs(startInterval, endInterval)
        const gap_1 = gap_1_idx !== -1 ? this.gaps[gap_1_idx] : null
        const gap_2 = gap_2_idx !== -1 ? this.gaps[gap_2_idx] : null

        if (gap_1 == null && gap_2 == null) {
            this.gaps.push(gap)
        } else if (gap_1 == null && gap_2 != null) {
            // is no previous gap and exists succeeding gap

            // first check can't be appended to succeeding gap
            if (gap.getEnd() === gap_2?.getStart()) {

                gap_2?.setStart(gap.getStart())
                return gap_2

            } else {

                this.gaps.unshift(gap)
                gap.setParent(gap_2)
                return gap

            }
        } else if (gap_1 != null && gap_2 == null) {
            // is no following gap and exists previous gap

            // TODO: find next unimportant event
            const gapEnd = gap.getEnd()
            const nextUnimportantEvent = this.findNextUnimportant(gapEnd)

            // first check if gap can be appended to previous gap!
            if (gap.getStart() === gap_1.getEnd()) {

                gap_1.setEnd(gap.getEnd())
                gap_1.setParent(null)
                gap_1.setEvent(nextUnimportantEvent)
                return gap_1

            } else {

                gap.setParent(null)
                gap.setEvent(nextUnimportantEvent)
                this.gaps.push(gap)
                return gap

            }
        } else if (gap_1 != null && gap_2 != null) {
            if (gap.getStart() === gap_1.getEnd() && gap.getEnd() === gap_2.getStart()) {

                gap_1.setParent(gap_2.getParent())
                gap_1.setEvent(gap_2.getEvent())
                const index = gap_2_idx !== null ? gap_2_idx : 0
                this.gaps.splice(index, 1)
                return gap_1

            } else if (gap.getStart() === gap_1.getEnd()) {

                gap_1.setEnd(gap.getEnd())
                gap_1.setParent(gap_2)
                return gap_1

            } else if (gap.getEnd() === gap_2.getStart()) {

                gap_2.setStart(gap.getStart())
                return gap_2

            } else {

                gap.setParent(gap_2)
                const index = gap_2_idx !== null ? gap_2_idx : 0
                this.gaps.splice(index, 0, gap)
                return gap

            }
        }
        return gap
    }

    addEvent(event: any): (Gap | null){

        // function takes as input event, and returns a Gap it is placed over, else null

        const lowerBoundStart = event.startTime
        const eventIntervals = this.eventsList.eventIntervals

        const startInterval = event.startInterval
        const endInterval = event.endInterval
        const importance = event.importance
        
        const nextEventIdx = this.findNextEvent(endInterval, eventIntervals)
        eventIntervals.splice(nextEventIdx, 0, event)

        // idx of inserted event for clarity
        const eventIdx = nextEventIdx

        // detect if exists conflict!
        const conflictingEventsIdxList: number[] = []
        let currIdx = eventIdx
        while (currIdx >=0 && eventIntervals[currIdx].startInterval >= startInterval) {
            conflictingEventsIdxList.push(currIdx)
            currIdx -= 1
        }
        const [gap_1_idx, gap_2_idx] = this.findGapIdxs(startInterval, endInterval)

        return null
    }
}