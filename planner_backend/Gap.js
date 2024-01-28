class Gap {

    constructor(start = null, end = null, parent = null) {
        // this.next not needed because it is implicit in LinkedListGaps.js

        // By not setting any parameters, we create a dummy object
        // The parent = - 1 means this Gap is by default the last gap before an unimportant event
        this.start = start
        this.end = end
        this.parent = parent
        this.event = null
    }

    getStart() {
        return this.start
    }

    getEnd() {
        return this.end
    }
    
    getParent() {
        return this.parent
    }

    getEvent() {
        return this.event
    }

    setStart(start) {
        this.start = start
    }

    setEnd(end) {
        this.end = end
    }

    setParent(parent) {
        this.parent = parent
    }

    setEvent(event) {
        this.event = event
    }
}

export default Gap