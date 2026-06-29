import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'

// The Tiptap Collaboration extension binds to doc.getXmlFragment('default').
// All tests mutate that same fragment so they mirror the real editor's shape.

function makeDoc(clientID = 1): Y.Doc {
  const doc = new Y.Doc()
  doc.clientID = clientID // pin for deterministic binary output
  return doc
}

function appendParagraph(frag: Y.XmlFragment, text: string): void {
  const p = new Y.XmlElement('paragraph')
  const t = new Y.XmlText()
  t.insert(0, text)
  p.insert(0, [t])
  frag.insert(frag.length, [p])
}

describe('Yjs encode / decode round-trip', () => {
  it('preserves XmlFragment content through encodeStateAsUpdate + applyUpdate', () => {
    const doc1 = makeDoc()
    appendParagraph(doc1.getXmlFragment('default'), 'Hello, round-trip!')

    const update = Y.encodeStateAsUpdate(doc1)
    expect(update.byteLength).toBeGreaterThan(2) // must produce a real update, not empty sentinel

    const doc2 = new Y.Doc()
    Y.applyUpdate(doc2, update)

    const frag1 = doc1.getXmlFragment('default')
    const frag2 = doc2.getXmlFragment('default')
    expect(frag2.toString()).toBe(frag1.toString()) // resolved XML string, not raw bytes
    expect(frag2.length).toBe(1)
  })

  it('preserves multiple paragraphs', () => {
    const doc1 = makeDoc()
    const frag = doc1.getXmlFragment('default')
    appendParagraph(frag, 'First paragraph')
    appendParagraph(frag, 'Second paragraph')
    appendParagraph(frag, 'Third paragraph')

    const doc2 = new Y.Doc()
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

    const frag2 = doc2.getXmlFragment('default')
    expect(frag2.toString()).toBe(frag.toString())
    expect(frag2.length).toBe(3)
  })

  it('applies an incremental delta update on top of existing state', () => {
    // This mirrors the room sync protocol: doc2 already has snapshot state,
    // doc1 adds more content, only the delta is sent.
    const doc1 = makeDoc()
    const frag = doc1.getXmlFragment('default')
    appendParagraph(frag, 'Initial content')

    const doc2 = new Y.Doc()
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

    appendParagraph(frag, 'Added later')
    const delta = Y.encodeStateAsUpdate(doc1, Y.encodeStateVector(doc2))
    Y.applyUpdate(doc2, delta)

    expect(doc2.getXmlFragment('default').toString()).toBe(frag.toString())
    expect(doc2.getXmlFragment('default').length).toBe(2)
  })
})
