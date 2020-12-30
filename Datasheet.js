async function getDatasheet(filename){
    const text = await $.ajax(filename);
    const json = jsyaml.safeLoad(text);
    return new Datasheet(json);
}

class Datasheet{

    constructor(json){
        this.wordLength = json.word;
        this.registers = {};
        for(let registerName in json.registers){
            const parsed = 
                this._parseRegister(registerName, json.registers[registerName]);
            this.registers[parsed.name] = parsed;
        }
    }

    _parseRegister(registerName, registerConfig){
        const registerNameParsed = this._breakName(registerName);
        const ret = [];

        // parse each bits group within a register

        for(let bitsGroupDef in registerConfig){
            const bitsGroupConfig = registerConfig[bitsGroupDef];
            const bitsGroupDefParsed = this._breakName(bitsGroupDef);

            const bitsGroupRet = {
                name: bitsGroupDefParsed.name,
                range: bitsGroupDefParsed.range,
                negativeLogic: bitsGroupDefParsed.negativeLogic,
                attributes: bitsGroupDefParsed.attributes,
                humanName: bitsGroupDefParsed.humanName,
                description: '',
                possibleValues: {},
            };

/*            if(bitsGroupConfig["name"]){
                bitsGroupRet.humanName = bitsGroupConfig["name"];
            }*/

            if(bitsGroupConfig["desc"]){
                bitsGroupRet.description = bitsGroupConfig["desc"];
            }

            const bitsGroupPossibleValues = {};
            for(let bitsGroupConfigKey in bitsGroupConfig){
                if(bitsGroupConfigKey[0] != "=") continue;
                if(bitsGroupConfigKey.length != bitsGroupDefParsed.range.length+1)
                    continue;
                bitsGroupPossibleValues[bitsGroupConfigKey.slice(1)] = 
                    bitsGroupConfig[bitsGroupConfigKey];
            }
            bitsGroupRet.possibleValues = bitsGroupPossibleValues;
            bitsGroupRet.evaluateMeaning = 
                this._compileConditionalDescriptions(bitsGroupConfig);

            ret.push(bitsGroupRet);
        }

        ret.sort(function(a,b){ return b.range[0] - a.range[0] });

        const countBits = (registerNameParsed.range.length > 1 ? 
            (registerNameParsed.range[0] - registerNameParsed.range[1] + 1) * this.wordLength :
            this.wordLength
        );

        let defaults = (function(){
            if(
                registerNameParsed.attributes &&
                registerNameParsed.attributes.indexOf("reset") >= 0
            ){
                const v = registerNameParsed.attributes[
                    registerNameParsed.attributes.indexOf("reset")+1
                ];
                return v.split("").map((e)=>parseInt(e,2));
            } else {
                let ret = [];
                for(let i=0; i<countBits;i++) ret.push(0);
                return ret;
            }
        })();

        return {
            name: registerNameParsed.name,
            humanName: registerNameParsed.humanName,
            bitsTotal: countBits,
            bits: (()=>{let a=[]; for(let i=countBits-1;i>=0;i--) a.push(i); return a})(),
            groups: ret,
            bitsDefault: defaults,
        }
    }

    _breakName(name){ // break name spec like: ^REGISTER[0:9] rw
        const spec0 = /^(\^?)([A-Z0-9]+)\[([0-9xA-F\:]+)\]([\sa-z0-9]+)?(\s<(.+)>)?$/;
        const match0 = name.match(spec0);
        if(!match0) throw Error("Cannot parse: " + name);

        const negativeLogic = (match0[1] != "");
        const mainName = match0[2];
        const addrStr = match0[3];
        const attributes = match0[4] || "";
        const humanName = match0[6] || "";

        const addrRule = /^((0x)?[0-9A-F]+)(\:((0x)?[0-9A-F]+))?$/;
        const matchAddr = addrStr.match(addrRule);
        if(!matchAddr) throw Error("Cannot parse: " + addrStr);

        function parseAddrTerminal(s){
            if(s.slice(0,2) == "0x") return parseInt(s, 16);
            return parseInt(s, 10);
        }

        let addr0 = parseAddrTerminal(matchAddr[1]), addr1 = matchAddr[4];
        let addrBits = [];
        if(undefined === addr1){
            addrBits.push(addr0);
        } else {
            addr1 = parseAddrTerminal(addr1);
            if(addr0 < addr1){
                throw Error("Must specify addr from higher to lower: " + addrStr);
            } else {
                for(let i=addr0; i>=addr1; i--) addrBits.push(i);
            }
        }

        return {
            range: addrBits,
            name: mainName,
            humanName: humanName,
            negativeLogic: negativeLogic,
            attributes: attributes.split(" ").filter((e)=>e!=""),
        }
        
    }

    _compileConditionalDescriptions(instructions){
        /* Take `instructions`(an object with keys of conditions and values of
        strings), returns a function that when called with global register
        state, can calculate a value.*/
        const toBeEvaluated = [];
        for(let ins in instructions){
            if(ins == "desc" || ins == "name") continue
            let c = ins;
            if(/^\=[01]+/.test(ins)){ // special case for short: =0101
                c = "$=" + c;
            }
            c = c.replace(/[a-zA-Z][a-zA-Z0-9]{0,}/g, "{{$&}}"); // protect all complete variable names for future replacing
            toBeEvaluated.push([c, instructions[ins]]);
        }
        return function(registerStatusByName, thisCurrentValue){
            const evaluations = toBeEvaluated.map(([c, desc]) => {
                let variables = c.match(/\{\{[0-9a-z]\}\}/ig);
                if(variables){
                    for(let variableEnclosed of variables){
                        let variableName = variable.Enclosed.slice(2, -2);
                        let value = registerStatusByName[variableName];
                        if(value === undefined){
                            // not found in global register status
                            console.warn("Cannot find register: " + variableName);
                        }
                        c = c.replace(variableEnclosed, value);
                    }
                }
                // inject current value of this cluster
                c = c.replace("$", thisCurrentValue);

                // now quote all 0101000... strings
                c = c.replace(/[01]+/g, "\"$&\"");

                try{
                    if(eval(c) === true) return desc;
                } catch(e){
                    console.error(c, e);
                }
                return null;
            }).filter((e)=>e != null);

            if(evaluations.length > 0){
                if(evaluations.length > 1){
                    console.warn(instructions, "is ambiguous");
                }
                return evaluations[0];
            } else {
                return "Undefined behaviour? Check datasheet definition.";
            }
        }
    }

}





export default getDatasheet;
