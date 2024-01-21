class Stack {
    constructor() {
        this.items = []
    }

    push(element) {
        this.items.push(element)
    }

    pop() {
        if (this.isEmpty()) {
            return null
        }
        return this.items.pop()
    }

    peek() {
        return this.isEmpty() ? null : this.items[this.items.length - 1]
    }

    isEmpty() {
        return this.items.length === 0
    }

    size() {
        return this.items.length
    }
}

export default Stack