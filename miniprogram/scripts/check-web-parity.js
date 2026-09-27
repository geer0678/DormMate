// Compare the real browser implementation against the migrated rule (without browser speech).
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const rules = require('../utils/dormmate')
const filename = process.argv[2]
if (!filename) throw new Error('Usage: node scripts/check-web-parity.js path/to/Web/script.js')
const elements = new Map()
const getElement = id => {
  if (!elements.has(id)) elements.set(id, {value:'',innerHTML:'',textContent:'',style:{},appendChild(){},addEventListener(type,handler){this[type]=handler}})
  return elements.get(id)
}
const context = {
  document: { getElementById:getElement,createElement:()=>({innerHTML:''}) },
  localStorage: {getItem:()=>null,setItem(){}},
  console, setTimeout(){}, Date, Number, String
}
vm.runInNewContext(fs.readFileSync(path.resolve(filename),'utf8'),context)
let count = 0
for (const t of [0,16,17.99,18,25,29.99,30,35,50]) {
  for (const h of [0,35,39.99,40,55,74.99,75,85,100]) {
    getElement('temperature').value=String(t)
    getElement('humidity').value=String(h)
    getElement('analyzeButton').click()
    const expected=rules.analyzeEnvironment(t,h)
    assert.ok(getElement('result').innerHTML.includes('当前状态：'+expected.status))
    assert.ok(getElement('result').innerHTML.includes('建议：'+expected.advice))
    count++
  }
}
console.log('原网页与小程序：'+count+' 组输入的状态和建议完全一致')

