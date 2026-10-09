import { expect, it, vi } from 'vitest'
const { setTs, setJs } = vi.hoisted(() => ({ setTs: vi.fn(), setJs: vi.fn() }))
vi.mock('monaco-editor', () => ({
  typescript: {
    typescriptDefaults: {
      modeConfiguration: { definitions: true, references: true, rename: false },
      setModeConfiguration: setTs
    },
    javascriptDefaults: {
      modeConfiguration: {
        definitions: true,
        references: false,
        completionItems: false
      },
      setModeConfiguration: setJs
    }
  }
}))
import { setTypeScriptNavigationMode } from './monaco-typescript-navigation-mode'
it('leaves default-off startup unchanged and restores exact native modes after disabling', () => {
  setTypeScriptNavigationMode(false)
  expect(setTs).not.toHaveBeenCalled()
  expect(setJs).not.toHaveBeenCalled()
  setTypeScriptNavigationMode(true)
  expect(setTs).toHaveBeenLastCalledWith({ definitions: false, references: false, rename: false })
  expect(setJs).toHaveBeenLastCalledWith({
    definitions: false,
    references: false,
    completionItems: false
  })
  setTypeScriptNavigationMode(false)
  expect(setTs).toHaveBeenLastCalledWith({ definitions: true, references: true, rename: false })
  expect(setJs).toHaveBeenLastCalledWith({
    definitions: true,
    references: false,
    completionItems: false
  })
})
