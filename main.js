import getDatasheet from "./Datasheet.js";
(async function(){
//////////////////////////////////////////////////////////////////////////////

const MCU_TYPE = "PIC18F26/45/46Q10";


const globalRegisterEvents = new Vue({ el: '#global', });
const allRegistersRendered = {};
const globalRegisterValues = {};

globalRegisterEvents.$on("changed", function(registerName){
    const register = allRegistersRendered[registerName];
    for(let k in register.groupValues){
        globalRegisterValues[k] = register.groupValues[k];
    }
});





const tableOfContents = new Vue({ el: "#toc",
    data: { 
        mcu: MCU_TYPE,
        filterModule: "",
        filterRegister: [],
        bookmarks: [],
        modules: {},
    },
    methods: {
        updateFilter: function(){
            let moduleChoosen = this.modules[this.filterModule];
            if(!moduleChoosen){
                this.filterRegister = [];
                this.$emit("filter", { register: [], cluster: [], });
                return;
            }
            let r = JSON.parse(JSON.stringify(moduleChoosen.registers)).filter((e)=>Boolean(e));
            let c = JSON.parse(JSON.stringify(moduleChoosen.clusters)).filter((e)=>Boolean(e));
            this.filterRegister = r;
            this.$emit("filter", {
                register: r,
                cluster: c,
            });
        }
    }
});


const optionsDialog = new Vue({ el: "#cluster-options",
    data: {
        register: "",
        cluster: "",
        humanName: "",
        choices: [],
        visible: false,
        range: [],
    },

    methods: {
        makeChoice: function(val){ // val = "010101..."
            const ret = {};
            for(let i in this.range){
                let bit_pos = this.range[i];
                ret[bit_pos] = parseInt(val[i], 2);
            }

            this.$emit("choosen", {
                register: this.register,
                cluster: this.cluster,
                value: ret, // { 15: 1, 14: 0, ... }
            });
        }
    }
});











const datasheet = await getDatasheet(MCU_TYPE.replace(/\//ig, "_") + ".yaml");
for(let r in datasheet.registers){
    const newRegister = renderRegister(datasheet.registers[r]);
    allRegistersRendered[newRegister.name] = newRegister;
    newRegister.toggleBit(0);
    newRegister.toggleBit(0);
    tableOfContents.bookmarks.push({
        name: newRegister.name,
        humanName: newRegister.humanName,
        href: "#register-" + newRegister.name,
    });
    tableOfContents.modules = JSON.parse(JSON.stringify(datasheet.modules));
}
function renderRegister(register){
    const elId = "register-" + register.name;
    $("<div>", { id: elId }).html($("#template").html()).appendTo("#content");

    function getGroupByName(name){
        return register.groups.filter((e)=>e.name==name)[0];
    }

    const bitsDef = [];
    for(let bit of register.bits){
        let bitsGroup = "";
        for(let g of register.groups){
//            console.log(g);
            if(g.range.indexOf(bit) >= 0){
                bitsGroup = g.name;
            }
        }
        bitsDef.push({
            bit: bit,
            withinGroup: bitsGroup,
        });
    }

    if(bitsDef.length > 1){
        for(let i=0; i<bitsDef.length; i++){
            if(i==0){
                if(bitsDef[i].withinGroup != ""){
                    bitsDef[0].groupSpan = getGroupByName(bitsDef[0].withinGroup).range.length;
                }
            } else {
                if(
                    bitsDef[i].withinGroup != bitsDef[i-1].withinGroup &&
                    bitsDef[i].withinGroup != ""
                ){
                    bitsDef[i].groupSpan = getGroupByName(bitsDef[i].withinGroup).range.length;
                } else if (
                    bitsDef[i].withinGroup == bitsDef[i-1].withinGroup &&
                    bitsDef[i].withinGroup != ""
                ){
                    bitsDef[i].groupSpan = -1;
                }
            }
        }
    }

    const ret = new Vue({
        el: "#"+elId,
        data: {
            collapsed: false,

            filterRegister: [],
            filterCluster: [],

            name: register.name,
            humanName: register.humanName,
            bits: bitsDef,                  // [ {bit,}, {...}, ... ], where bit = 15,14,13,... (example)
                                            //     ||     ||
                                            // [   0,      1,   ... ], order is guaranteed
            values: JSON.parse(JSON.stringify(register.bitsDefault)),
            defaultValues: JSON.parse(JSON.stringify(register.bitsDefault)),
        },

        methods: {
            toggleBit: function(values_i){
                this.$set(this.values, values_i, 1^this.values[values_i]);
                globalRegisterEvents.$emit("changed", this.name);
            },

            showClusterOptions: function(group_name){
                const val = this.groupValues[group_name];
                if(val.length < 1) return;
                let g = null;
                for(g of register.groups){
                    if(g.name == group_name){
                        break;
                    }
                }
                if(!g) return;

                const ret = [];

                for(let i=0; i<Math.pow(2, val.length); i++){
                    let bits = i.toString(2);
                    while(bits.length < val.length) bits = '0' + bits;
                    const meaning = g.evaluateMeaning(
                        globalRegisterValues,    // all clusters state
                        bits
                    );
                    ret.push({ bits, meaning });
                }

                optionsDialog.register = register.name;
                optionsDialog.cluster = group_name;
                optionsDialog.humanName = g.humanName;
                optionsDialog.choices = ret;
                optionsDialog.range = g.range;
                optionsDialog.visible = true;
            },
        },

        computed: {
            valueByBit: function(){
                let ret = {};
                for(let i=0; i<this.bits.length; i++){
                    ret[this.bits[i].bit] = this.values[i];
                }
                return ret;
            },
            defaultValueByBit: function(){
                let ret = {};
                for(let i=0; i<this.bits.length; i++){
                    ret[this.bits[i].bit] = register.bitsDefault[i];
                }
                return ret;
            },
            nondefaultGroupValues: function(){
                /* All groups(clusters) that have values changed from default.*/
                const ret = {};
                for(let g of register.groups){
                    const defaultValue = g.range.map(
                        (bit)=>this.defaultValueByBit[bit].toString()).join("");
                    const currentValue = g.range.map(
                        (bit)=>this.valueByBit[bit].toString()).join("");
                    if(defaultValue != currentValue){
                        ret[g.name] = {
                            default: defaultValue,
                            value: currentValue,
                            hex: '0x' + parseInt(currentValue, 2).toString(16).toUpperCase(),
                        };
                    }
                }
                return ret;
            },
            groupValues: function(){
                const self = this;
                let ret = {};
                for(let g of register.groups){
                    ret[g.name] = (function(g){
                        const v = g.range.map((bit)=>self.valueByBit[bit].toString());
                        return v.join("");
                    })(g);
                }
                return ret;
            },
            groupCurrentDescriptions: function(){
                const self = this;
                let ret = {};
                for(let g of register.groups){
                    // TODO we may use conditional evaluation in this expression
                    //ret[g.name] = g.possibleValues[this.groupValues[g.name]];
                    ret[g.name] = g.evaluateMeaning(
                        globalRegisterValues,    // all clusters state
                        this.groupValues[g.name] // value of this cluster
                    );
                }
                return ret;
            },
            groupHumanNameByName: function(){
                let ret = {};
                for(let g of register.groups){
                    ret[g.name] = g.humanName || false;
                }
                return ret;
            },
            groupNegativeLogicByName: function(){
                let ret = {};
                for(let g of register.groups){
                    ret[g.name] = Boolean(g.negativeLogic);
                }
                return ret;
            },
        },
    });


    // Listen of optionsDialog event "choosen"
    optionsDialog.$on("choosen", function(e){
        if(register.name != e.register) return;
        const newVal = e.value;
        for(let i in ret.bits){
            let bit_pos = ret.bits[i].bit;
            if(newVal[bit_pos] != undefined){
                ret.values[i] = newVal[bit_pos];
            }
        }
        ret.values = JSON.parse(JSON.stringify(ret.values));
    });

    // Listen of ToC event "filter"
    tableOfContents.$on("filter", function({ register, cluster }){
        ret.filterRegister = register;
        ret.filterCluster = cluster;
    });

    return ret;
}




/*
tableOfContents.$emit("filter", { register: ["INTCON"], cluster: ["IPEN"] });
*/

/*const app = new Vue({
    el: "#app",
    data: {
        registers: JSON.parse(JSON.stringify(datasheet.registers)),
    }
});

console.log(app.registers["CONFIG1"]["bits"]);*/


//////////////////////////////////////////////////////////////////////////////
})();
