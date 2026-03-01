frappe.ui.form.on('Fee Structure', {
    refresh: function(frm) {
        frm.set_query('item_code', 'items', function() {
            return { doctype: 'Item' };
        });
    }
});

frappe.ui.form.on('Fee Structure Item', {
    item_code: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.item_code && row.pricelist_name) {
            frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'Item Price',
                    filters: { item_code: row.item_code, price_list: row.pricelist_name },
                    fieldname: 'price_list_rate'
                },
                callback: function(r) {
                    if (r.message) frappe.model.set_value(cdt, cdn, 'rate', r.message.price_list_rate);
                }
            });
        }
    },
    pricelist_name: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.item_code && row.pricelist_name) {
            frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'Item Price',
                    filters: { item_code: row.item_code, price_list: row.pricelist_name },
                    fieldname: 'price_list_rate'
                },
                callback: function(r) {
                    if (r.message) frappe.model.set_value(cdt, cdn, 'rate', r.message.price_list_rate);
                }
            });
        }
    }
});
