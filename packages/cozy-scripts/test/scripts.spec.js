/* eslint-env jest */

const fs = require('fs-extra')
const path = require('path')
const colorize = require('../utils/_colorize.js')
const spawn = require('cross-spawn')

const testFolder = '.tmp_test'
const rootPath = process.cwd()
const appName = 'test-app'
const testPath = path.join(rootPath, testFolder)
const appPath = path.join(testPath, appName)
const customConfigPath = path.join(appPath, 'app.config.js')
const ownTestConfig = path.join(rootPath, __dirname, 'lib', 'test.config.js')
const servicesTestConfig = path.join(rootPath, __dirname, 'lib', 'services.config.js')
const strategyTestConfig = path.join(rootPath, __dirname, 'lib', 'strategy.config.js')

process.on('SIGINT', () => {
  console.log()
  console.log()
  console.log(colorize.red('Kill signal detected. Graceful exit...'))
  cleanUp()
  process.exit(1)
})

jest.setTimeout(180000) // 180s timeout

function cleanUp () {
  console.log(colorize.orange('Cleaning up generated files'))
  process.chdir(rootPath)
  fs.removeSync(testPath)
  console.log('Cleaned.')
}

// List all files in a directory recursively synchronously
const excludedFiles = [
  '.DS_Store',
  '.Spotlight-V100',
  '.Trashes',
  'ehthumbs.db',
  'Thumbs.db',
  'desktop.ini'
]
var readDeepDirSync = function (dir, filelist, parentPath = '') {
  const files = fs.readdirSync(dir)
  filelist = filelist || []
  files.forEach(file => {
    const fileOrDirPath = path.join(dir, file)
    // it's a folder (exception for node_modules, we consider it
    // as simple file here to avoid useless noise in snapshots)
    if (fs.statSync(fileOrDirPath).isDirectory() && file !== 'node_modules') {
      const parent = `${parentPath}${file}/`
      filelist = readDeepDirSync(`${fileOrDirPath}/`, filelist, parent)
    } else {
      if (!excludedFiles.includes(file)) filelist.push(`${parentPath}${file}`)
    }
  })
  return filelist
}

const overrideData = {
  '<SLUG_GH>': appName,
  '<SLUG_NPM>': appName,
  '<APP_SHORT_DESCRIPTION>': 'Application for tests',
  '<APP_CATEGORY>': 'test',
  '<USERNAME_GH>': 'foo',
  '<USER_EMAIL_GH>': 'mock@example.test',
  '<USER_WEBSITE>': 'mock.example.test'
}

function getConfig () {
  const configFromScriptPath = path.join(appPath, 'node_modules', 'cozy-scripts', 'scripts', 'config.js')
  let appConfig = require(configFromScriptPath)
  // we replace path to avoid environment specific snapshots
  // ex: paths like `/me/test/${testFolder}/...` will be `${testFolder}/...`
  const pathReplaceRegex = new RegExp(`"\\S*/${testFolder}/${appName}`, 'g')
  return JSON.stringify(appConfig, null, 2)
    .replace(pathReplaceRegex, `"${testFolder}/${appName}`)
}

describe('App from cozy-scripts', () => {
  beforeAll(() => {
    // create the app test folder
    fs.ensureDirSync(appPath)
    process.chdir(appPath)
    fs.writeJsonSync('./package.json', {name: appName})
    // install the scripts and run it, this part is normally handlded by create-cozy-app
    const args = [
      'add',
      '--prefer-online',
      '--exact' // always at the end
    ].concat([`cozy-scripts@file:${path.join(rootPath, 'packages', 'cozy-scripts')}`])
    spawn.sync('yarn', args, { stdio: 'inherit' })
  })

  beforeEach(() => {
    // reset NODE_ENV
    if (process.env.NODE_ENV) delete process.env.NODE_ENV
    jest.resetModules()
    if (fs.existsSync(customConfigPath)) {
      fs.removeSync(customConfigPath)
    }
  })

  afterAll(() => {
    // clean up all
    cleanUp()
  })

  // Files outline
  it('should have the correct files outline', (done) => {
    const init = require(path.join(appPath, 'node_modules', 'cozy-scripts', 'scripts', 'init.js'))
    const options = { verbose: false }
    // run the initiallisation script
    init(appPath, appName, options, (e) => {
      console.log(colorize.red('The script exited for some reasons. The test failed.'))
      cleanUp()
      console.log(e)
      throw new Error(colorize.red('Scripts tests failed.'))
    }, overrideData, () => {
      console.log(colorize.orange('Asserting created app content (files outline)...'))
      const generatedElements = readDeepDirSync(appPath)
      expect(generatedElements).toMatchSnapshot()
      // we use done() here to force waiting this callback call
      done()
    })
  })

  // Output configuration
  it('should have the correct config browser:development by default', () => {
    console.log(colorize.orange('Asserting configs...'))
    const appConfig = getConfig()
    expect(JSON.parse(appConfig)).toMatchSnapshot()
  })

  it('should have the correct config browser:development by default handling --debug mode', () => {
    process.env.COZY_SCRIPTS_DEBUG = 'true'
    const appConfig = getConfig()
    expect(JSON.parse(appConfig)).toMatchSnapshot()
  })

  it('should have the correct config browser:development according to NODE_ENV=browser:development', () => {
    process.env.NODE_ENV = 'browser:development'
    const appConfig = getConfig()
    expect(JSON.parse(appConfig)).toMatchSnapshot()
  })

  it('should have the correct config browser:production according to NODE_ENV=browser:production', () => {
    process.env.NODE_ENV = 'browser:production'
    const appConfig = getConfig()
    expect(JSON.parse(appConfig)).toMatchSnapshot()
  })

  it('should have the correct config mobile:development according to NODE_ENV=mobile:development', () => {
    process.env.NODE_ENV = 'mobile:development'
    const appConfig = getConfig()
    expect(JSON.parse(appConfig)).toMatchSnapshot()
  })

  it('should have the correct config mobile:production according to NODE_ENV=mobile:production', () => {
    process.env.NODE_ENV = 'mobile:production'
    const appConfig = getConfig()
    expect(JSON.parse(appConfig)).toMatchSnapshot()
  })

  // Generated app tests
  it('should pass all app tests with success', () => {
    console.log(colorize.orange('Running app tests...'))
    expect(() => {
      const result = spawn.sync('yarn', ['test'], { stdio: 'inherit' })
      if (result.status === 1) throw new Error('The generated applciation tests failed')
    }).not.toThrow()
  })

  // Custom app.config.js
  it('should use the custom app config if an `app.config.js` exists in the app directory', () => {
    fs.copySync(ownTestConfig, customConfigPath)
    const appConfig = getConfig()
    expect(JSON.parse(appConfig)).toMatchSnapshot()
  })

  it('should return two separated configs if services config is used (also test app.config.js usage)', () => {
    fs.copySync(servicesTestConfig, customConfigPath)
    fs.ensureDirSync(path.join(appPath, 'src', 'targets', 'services'))
    fs.writeFileSync(path.join(appPath, 'src', 'targets', 'services', 'testservice.js'), '')
    const appConfig = getConfig()
    expect(JSON.parse(appConfig)).toMatchSnapshot()
  })

  it('should correctly use the webpack-merge strategy if a __mergeStrategy property is found', () => {
    fs.copySync(strategyTestConfig, customConfigPath)
    const appConfig = getConfig()
    expect(JSON.parse(appConfig)).toMatchSnapshot()
  })

  // Webpack running
  it('should run webpack.run correctly with build script', (done) => {
    console.log(colorize.orange('Testing cozy-scripts build script...'))
    process.env.NODE_ENV = 'browser:production'
    const build = require(path.join(appPath, 'node_modules', 'cozy-scripts', 'scripts', 'build.js'))
    expect(() => build(done)).not.toThrow()
  })

  // should be always at the end (due to cleanUp usage)
  it('should run webpack.watch correctly with watch script', (done) => {
    console.log(colorize.orange('Testing cozy-scripts watch script...'))
    process.env.NODE_ENV = 'browser:development'
    const watch = require(path.join(appPath, 'node_modules', 'cozy-scripts', 'scripts', 'watch.js'))
    expect(() => watch(multiWatching => {
      multiWatching.close(() => {
        let isClosed = true
        for (const watching of multiWatching.watchings) {
          isClosed = isClosed && watching.closed
        }
        if (isClosed) {
          console.log(colorize.orange('Watch script closed correctly.'))
        } else {
          cleanUp()
          throw new Error(colorize.red('The watch script may not have been closed correctly'))
        }
        done()
      })
    })).not.toThrow()
  })
})
