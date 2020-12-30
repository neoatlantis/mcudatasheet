import getDatasheet from "./Datasheet.js";
(async function(){
//////////////////////////////////////////////////////////////////////////////


const globalRegisterEvents = new Vue({ el: '#global', });
const allRegistersRendered = {};
const globalRegisterValues = {};

globalRegisterEvents.$on("changed", function(registerName){
    const register = allRegistersRendered[registerName];
    for(let k in register.groupValues){
        globalRegisterValues[k] = register.groupValues[k];
    }
});

















const datasheet = await getDatasheet("PIC18F26_45_46Q10.yaml");
for(let r in datasheet.registers){
    const newRegister = renderRegister(datasheet.registers[r]);
    allRegistersRendered[newRegister.name] = newRegister;
}
function renderRegister(register){
    const elId = "register-" + register.name;
    $("<div>", { id: elId }).html($("#template").html()).appendTo("body");

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


    return new Vue({
        el: "#"+elId,
        data: {
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
            }
        },

        computed: {
            valueByBit: function(){
                let ret = {};
                for(let i=0; i<this.bits.length; i++){
                    ret[this.bits[i].bit] = this.values[i];
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
                    ret[g.name] = g.possibleValues[this.groupValues[g.name]];
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
}





/*const app = new Vue({
    el: "#app",
    data: {
        registers: JSON.parse(JSON.stringify(datasheet.registers)),
    }
});

console.log(app.registers["CONFIG1"]["bits"]);*/


//////////////////////////////////////////////////////////////////////////////
})();
